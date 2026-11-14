/**
 * Drive the vision actions end to end through the agent (Prompt 5c-iii Action 2).
 *
 * Mints a proof, exchanges it for a token, then: VISION_STATUS → DOWNLOAD_VISION_ENGINE (polling progress) → START_VISION_SIDECAR →
 * /health on 8011 → STOP. Prints the exact numbers the report needs, including whether the on-disk hash matched the pin.
 *
 * Run: node desktop/verify-vision-engine.mjs
 */
import { createHmac, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

const SECRET = process.env.AGENT_SECRET;
if (!SECRET) throw new Error("AGENT_SECRET must be set");
const AGENT = "http://127.0.0.1:8012";

function proof() {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ userId: "vision-user", orgId: "vision-org", agentToken: randomUUID(), iat: now, exp: now + 300 }),
  ).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(body).digest().toString("base64url");
  return `${body}.${signature}`;
}

const handshake = await fetch(`${AGENT}/handshake`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ proof: proof() }),
});
const token = (await handshake.json())?.data?.agentToken;
console.log(`handshake: ${handshake.status} · token ${token ? "issued" : "MISSING"}`);

async function call(action, payload) {
  const response = await fetch(`${AGENT}/api/local/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-UltraOS-Token": token },
    body: JSON.stringify({ action, payload: payload ?? null }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const before = await call("VISION_STATUS");
console.log(`status before: ${JSON.stringify(before.body?.data)}`);

if (before.body?.data?.installed) {
  console.log("already installed - skipping download");
} else {
  const started = await call("DOWNLOAD_VISION_ENGINE");
  console.log(`download started: ${started.status} ${JSON.stringify(started.body?.data ?? started.body)}`);
  const beganAt = Date.now();
  let lastLogged = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const status = (await call("VISION_STATUS")).body?.data;
    const pct = status?.totalBytes ? Math.round((status.downloadedBytes / status.totalBytes) * 100) : 0;
    if (pct >= lastLogged + 20 || status?.installed || status?.error) {
      lastLogged = pct;
      console.log(`  ${pct}% · ${(status.downloadedBytes / 1048576).toFixed(1)} / ${(status.totalBytes / 1048576).toFixed(1)} MB${status.error ? ` · error: ${status.error}` : ""}`);
    }
    if (status?.installed || status?.error) {
      console.log(`download finished in ${((Date.now() - beganAt) / 60000).toFixed(1)} min · installed=${status.installed} error=${status.error ?? "none"}`);
      break;
    }
    if (Date.now() - beganAt > 30 * 60 * 1000) {
      console.log("timed out after 30 min");
      break;
    }
  }
}

const enginePath = `${process.env.APPDATA}\\ng.neonultra.scoring\\vision\\engine.exe`;
console.log(`engine.exe present: ${existsSync(enginePath)}`);

const started = await call("START_VISION_SIDECAR");
console.log(`start: ${started.status} ${JSON.stringify(started.body)}`);

try {
  const health = await fetch("http://127.0.0.1:8011/health");
  console.log(`sidecar /health: ${health.status} ${JSON.stringify(await health.json())}`);
} catch (error) {
  console.log(`sidecar /health failed: ${error.message}`);
}

const running = await call("VISION_STATUS");
console.log(`status while running: ${JSON.stringify(running.body?.data)}`);

const stopped = await call("STOP_VISION_SIDECAR");
console.log(`stop: ${stopped.status} ${JSON.stringify(stopped.body)}`);
