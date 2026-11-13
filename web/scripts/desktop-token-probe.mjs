/**
 * Probe the desktop token flow from inside the running page, one step at a time, reporting the status of each hop.
 *
 * Used while chasing "Failed to fetch" - which is what a browser reports for a CORS preflight failure, not just for a dead server.
 */
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const context = browser.contexts()[0];
const page = context.pages().find((candidate) => candidate.url().includes("127.0.0.1:4120")) ?? context.pages()[0];

const result = await page.evaluate(async () => {
  const log = [];
  const step = async (name, run) => {
    try {
      log.push({ step: name, value: await run() });
    } catch (error) {
      log.push({ step: name, error: error instanceof Error ? error.message : String(error) });
    }
  };

  await step("token endpoint", async () => {
    const response = await fetch("/api/desktop/agent-token", { credentials: "include" });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, hasProof: Boolean(body.proof) };
  });

  let token;
  await step("handshake", async () => {
    const proofResponse = await fetch("/api/desktop/agent-token", { credentials: "include" });
    const { proof } = await proofResponse.json();
    const response = await fetch("http://127.0.0.1:8012/handshake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof }),
    });
    const body = await response.json().catch(() => ({}));
    token = body?.data?.agentToken;
    return { status: response.status, tokenIssued: Boolean(token) };
  });

  if (token) {
    await step("agent PING with token", async () => {
      const response = await fetch("http://127.0.0.1:8012/api/local/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-UltraOS-Token": token },
        body: JSON.stringify({ action: "PING" }),
      });
      return { status: response.status, body: (await response.text()).slice(0, 120) };
    });
  }

  return log;
});

for (const entry of result) console.log(` ${entry.step}: ${entry.error ? `ERROR ${entry.error}` : JSON.stringify(entry.value)}`);

await browser.close();
