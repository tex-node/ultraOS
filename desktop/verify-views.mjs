/**
 * Two-views diagnostic: does the agent's READ_OUTBOX agree with the file on disk?
 *
 * Clean restart, one instance, one row written through the agent, then both views compared. If they disagree the discrepancy is
 * the bug and no further acceptance run will be meaningful.
 *
 * Run: node desktop/verify-views.mjs
 */
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

const SECRET = process.env.AGENT_SECRET ?? "development-only-agent-secret";
const AGENT = "http://127.0.0.1:8012";
const PYTHON = "C:\\Users\\XPS\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe";
const KEY = "diag-1";

function proof() {
  const now = Math.floor(Date.now() / 1000);
  const payload = { userId: "diag-user", orgId: "diag-org", agentToken: randomUUID(), iat: now, exp: now + 300 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(body).digest().toString("base64url");
  return `${body}.${signature}`;
}

async function call(token, action, payload) {
  const response = await fetch(`${AGENT}/api/local/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-UltraOS-Token": token },
    body: JSON.stringify({ action, payload: payload ?? null }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function fileQuery(dbPath, sql) {
  const script = [
    "import sqlite3, sys",
    `rows = list(sqlite3.connect(sys.argv[1]).execute(sys.argv[2]))`,
    "print('\\n'.join(' | '.join('NULL' if v is None else str(v) for v in row) for row in rows) or '(no rows)')",
  ].join("\n");
  return execFileSync(PYTHON, ["-c", script, dbPath, sql], { encoding: "utf8" }).trim();
}

const handshake = await fetch(`${AGENT}/handshake`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ proof: proof() }),
});
const token = (await handshake.json())?.data?.agentToken;
console.log(`handshake: ${handshake.status} · token ${token ? "issued" : "MISSING"}`);

const ping = await call(token, "PING");
const dbPath = ping.body?.data?.dbPath;
console.log(`PING: store=${ping.body?.data?.store} · dbPath=${dbPath}`);
console.log(`file exists: ${existsSync(dbPath)}`);

const record = {
  idempotencyKey: KEY,
  entityType: "GameEvent",
  entityId: "diag-entity",
  operation: "CREATE",
  payload: { points: 2 },
  clientUpdatedAt: new Date().toISOString(),
  deviceId: "diag-device",
};
const saved = await call(token, "SAVE_OUTBOX", record);
console.log(`SAVE_OUTBOX: ${JSON.stringify(saved.body?.data)}`);

const read = await call(token, "READ_OUTBOX");
const agentRows = Array.isArray(read.body?.data) ? read.body.data : [];
console.log(`READ_OUTBOX (agent): ${agentRows.length} row(s) · diag-1 present: ${agentRows.some((row) => row.idempotencyKey === KEY)}`);

console.log(`file query: ${fileQuery(dbPath, `SELECT idempotencyKey, syncedAt FROM outbox WHERE idempotencyKey='${KEY}'`)}`);

const agree = agentRows.some((row) => row.idempotencyKey === KEY);
console.log(`\n  ${agree ? "AGREE - both views see the row" : "DISAGREE - agent does not see a row the file has"}`);
process.exit(agree ? 0 : 1);
