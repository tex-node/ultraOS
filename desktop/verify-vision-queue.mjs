/**
 * Verify the vision observation queue (5c-iv Action 1).
 *
 * SAVE 3 → READ 3 → MARK one APPLIED → READ 2 → re-SAVE the same 3 → still 3 rows. Then a FAILED sweep to prove dead-lettering at
 * five attempts matches the scoring outbox.
 *
 * Run: node desktop/verify-vision-queue.mjs
 */
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

const SECRET = process.env.AGENT_SECRET;
if (!SECRET) throw new Error("AGENT_SECRET must be set");
const AGENT = "http://127.0.0.1:8012";
const DB = path.join(process.env.APPDATA, "ng.neonultra.scoring", "ultraos", "outbox.db");
const PYTHON = "C:\\Users\\XPS\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe";

function proof() {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ userId: "queue-user", orgId: "queue-org", agentToken: randomUUID(), iat: now, exp: now + 300 }),
  ).toString("base64url");
  return `${body}.${createHmac("sha256", SECRET).update(body).digest().toString("base64url")}`;
}

const handshake = await fetch(`${AGENT}/handshake`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ proof: proof() }),
});
const token = (await handshake.json())?.data?.agentToken;

async function call(action, payload) {
  const response = await fetch(`${AGENT}/api/local/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-UltraOS-Token": token },
    body: JSON.stringify({ action, payload: payload ?? null }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function sql(query) {
  const script = [
    "import sqlite3, sys",
    "rows = list(sqlite3.connect(sys.argv[1]).execute(sys.argv[2]))",
    "print('\\n'.join(' | '.join('NULL' if v is None else str(v) for v in row) for row in rows) or '(no rows)')",
  ].join("\n");
  return execFileSync(PYTHON, ["-c", script, DB, query], { encoding: "utf8" }).trim();
}

const observations = [1, 2, 3].map((index) => ({
  id: `queue-obs-${index}`,
  videoTimeMs: index * 1000,
  observationType: "PERSON_DETECTED",
  boundingBox: { x: 0.1, y: 0.2, width: 0.05, height: 0.1 },
  confidence: 0.8,
}));

const batch = { gameVideoId: "gv-1", analysisRunId: "run-1", observations };

console.log(`SAVE 3: ${JSON.stringify((await call("SAVE_VISION_OBSERVATIONS", batch)).body)}`);
const first = await call("READ_VISION_OBSERVATIONS");
console.log(`READ: ${first.body?.data?.length} pending`);

const marked = await call("MARK_VISION_SYNCED", { ids: ["queue-obs-1"], status: "APPLIED" });
console.log(`MARK 1 APPLIED: ${JSON.stringify(marked.body)}`);
const second = await call("READ_VISION_OBSERVATIONS");
console.log(`READ: ${second.body?.data?.length} pending (expected 2)`);

const again = await call("SAVE_VISION_OBSERVATIONS", batch);
console.log(`re-SAVE 3: ${JSON.stringify(again.body)}`);
console.log(`sqlite rows: ${sql("SELECT count(*) FROM vision_observations WHERE id LIKE 'queue-obs-%'")}`);

// FAILED sweep, to prove the dead-letter threshold matches the scoring outbox.
for (let attempt = 1; attempt <= 5; attempt++) {
  await call("MARK_VISION_SYNCED", { ids: ["queue-obs-2"], status: "FAILED", reason: "server said no" });
}
console.log(
  `after 5 failures: ${sql("SELECT id, attemptCount, deadLetteredAt IS NOT NULL FROM vision_observations WHERE id = 'queue-obs-2'")}`,
);
console.log(`pending now: ${(await call("READ_VISION_OBSERVATIONS")).body?.data?.length}`);

// cleanup so the row does not linger in the demo database
await fetch(`${AGENT}/api/local/agent`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-UltraOS-Token": token },
  body: JSON.stringify({ action: "CLEAR_OUTBOX", payload: null }),
});
console.log(`cleanup rows: ${sql("DELETE FROM vision_observations WHERE id LIKE 'queue-obs-%'; SELECT changes()")}`);
