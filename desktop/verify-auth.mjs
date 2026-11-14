/**
 * Verify the agent's proof-based auth: valid, tampered, expired, plus the token rules.
 *
 * Mirrors what `/api/desktop/agent-token` produces (base64url(payload) + "." + base64url(HMAC-SHA256)) so the agent can be tested
 * without a running web server. The secret must match the one the app was started with.
 *
 * Run: node desktop/verify-auth.mjs [--reuse-token <file>]
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const SECRET = process.env.AGENT_SECRET ?? "development-only-agent-secret";
const AGENT = "http://127.0.0.1:8012";

function mint({ userId = "user-1", orgId = "org-1", expOffset = 300, agentToken = randomUUID() } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { userId, orgId, agentToken, iat: now, exp: now + expOffset };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(body).digest().toString("base64url");
  return { proof: `${body}.${signature}`, agentToken };
}

async function post(path, body, headers = {}) {
  const response = await fetch(`${AGENT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text };
}

async function handshake(proof) {
  return post("/handshake", { proof });
}

const results = [];
const record = (name, expected, actual) => {
  const pass = expected === actual;
  results.push({ name, expected, actual, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(46)} expected ${expected}, got ${actual}`);
};

// 1. valid proof
const valid = mint();
const ok = await handshake(valid.proof);
record("valid proof → 200", 200, ok.status);

// The agent mints its own signed token now (Prompt 5c-i), so the uuid inside the proof is no longer what it hands back. The
// authenticated call has to use the token from the response body - using the proof's uuid was the out-of-date assertion here.
const issued = JSON.parse(ok.body)?.data?.agentToken;
record("handshake returns a signed blob", true, typeof issued === "string" && issued.includes("."));

// 2. tampered signature
const tampered = `${valid.proof.slice(0, -4)}AAAA`;
record("tampered signature → 401", 401, (await handshake(tampered)).status);

// 3. expired proof
const expired = mint({ expOffset: -30 });
record("expired proof → 401", 401, (await handshake(expired.proof)).status);

// 4. authenticated agent call
record(
  "agent call with token → 200",
  200,
  (await post("/api/local/agent", { action: "PING" }, { "X-UltraOS-Token": issued })).status,
);

// 4b. a tampered signed token must not be accepted
record(
  "tampered signed token → 401",
  401,
  (await post("/api/local/agent", { action: "PING" }, { "X-UltraOS-Token": `${issued?.slice(0, -4)}AAAA` })).status,
);

// 5. no token
record("agent call without token → 401", 401, (await post("/api/local/agent", { action: "PING" })).status);

// 6. a token the agent never issued
record(
  "agent call with foreign token → 401",
  401,
  (await post("/api/local/agent", { action: "PING" }, { "X-UltraOS-Token": randomUUID() })).status,
);

// 7. reuse a token from a previous launch (the caller writes it out, restarts the app, then runs with --reuse-token)
const reuseIndex = process.argv.indexOf("--reuse-token");
if (reuseIndex !== -1) {
  const file = process.argv[reuseIndex + 1];
  if (process.argv.includes("--write")) {
    writeFileSync(file, valid.agentToken);
    console.log(`  wrote token for the restart test: ${file}`);
  } else {
    const previous = readFileSync(file, "utf8").trim();
    record(
      "token from a previous launch → 401",
      401,
      (await post("/api/local/agent", { action: "PING" }, { "X-UltraOS-Token": previous })).status,
    );
  }
}

const failed = results.filter((result) => !result.pass).length;
console.log(`\n  ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
