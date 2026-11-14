/**
 * Verify `/api/vision/sync`'s authorization layer (Prompt 5c-i).
 *
 * Mints agent tokens exactly as the desktop agent does (base64url(payload).base64url(HMAC-SHA256)) and checks each refusal against
 * the running app. A route that accepts a body-declared organization is a tenancy bug, so that case is the one that matters most.
 *
 * Run: node scripts/verify-vision-sync.mjs [baseUrl]
 */
import { createHmac, randomUUID } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:4173";
const SECRET = process.env.AGENT_SECRET;
if (!SECRET) throw new Error("AGENT_SECRET must be set (it is in web/.env.test)");

const ORG = "cmucgcmxk0000svkkew5wg9yf"; // LBCL org: a real id, different from the token's org below
const TOKEN_ORG = "cmt4odhgn0000wokk8fbwr6ro";

function mint({ orgId = TOKEN_ORG, expOffset = 3600, tamper = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { userId: "diag-user", orgId, uuid: randomUUID(), iat: now, exp: now + expOffset };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  let signature = createHmac("sha256", SECRET).update(body).digest().toString("base64url");
  if (tamper) signature = `${signature.slice(0, -4)}AAAA`;
  return `${body}.${signature}`;
}

async function post({ token, body }) {
  const response = await fetch(`${BASE}/api/vision/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-UltraOS-Token": token } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.text() };
}

const observations = [
  {
    id: randomUUID(),
    videoTimeMs: 1000,
    observationType: "PLAYER_DETECTION",
    boundingBox: { x: 0.1, y: 0.1, width: 0.05, height: 0.1 },
    confidence: 0.9,
  },
];
const validBody = { observations, gameVideoId: "nonexistent-video", analysisRunId: "nonexistent-run" };

const cases = [
  ["no token → 401", { body: validBody }, 401],
  ["tampered token → 401", { token: mint({ tamper: true }), body: validBody }, 401],
  ["expired token → 401", { token: mint({ expOffset: -60 }), body: validBody }, 401],
  [
    "body org differs from token → 400",
    { token: mint(), body: { ...validBody, organizationId: ORG } },
    400,
  ],
  ["unknown references in-org → 404", { token: mint(), body: validBody }, 404],
  ["missing references → 400", { token: mint(), body: { observations } }, 400],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  const result = await post(input);
  const pass = result.status === expected;
  if (!pass) failed++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(44)} expected ${expected}, got ${result.status} · ${result.body.slice(0, 80)}`);
}

console.log(`\n  ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
