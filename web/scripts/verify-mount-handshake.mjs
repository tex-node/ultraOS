/**
 * Mount-time handshake evidence (Prompt 5a).
 *
 * Opens the capture console inside the running shell and records the agent traffic the page emits on mount: the proof request, the
 * handshake, and the first agent call. Also reports the banner's presence, which is what the scorer sees when the handshake fails.
 *
 * Run: node scripts/verify-mount-handshake.mjs <fixtureId>
 */
import { chromium } from "playwright";

const FIXTURE = process.argv[2];
if (!FIXTURE) throw new Error("usage: node scripts/verify-mount-handshake.mjs <fixtureId>");

const APP = "http://127.0.0.1:4120";
const seen = [];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const context = browser.contexts()[0];
const page = context.pages()[0];

page.on("response", (response) => {
  const url = response.url();
  if (url.includes("/api/desktop/agent-token") || url.includes(":8012/handshake") || url.includes(":8012/api/local/agent")) {
    seen.push({ url: url.replace(/^(https?:\/\/[^/]+).*/, "$1"), status: response.status() });
  }
});

await page.goto(`${APP}${process.env.CONSOLE_PATH ?? `/games/${FIXTURE}/live`}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("p.text-5xl", { timeout: 30_000 });
await page.waitForTimeout(4_000);

const banner = await page.evaluate(() => {
  const status = document.querySelector('[role="status"]');
  return status ? (status.textContent ?? "").trim() : null;
});

console.log(`agent traffic on mount:`);
if (seen.length === 0) console.log("  (none)");
for (const entry of seen) console.log(`  ${entry.url} → ${entry.status}`);
console.log(`banner: ${banner === null ? "not shown" : JSON.stringify(banner)}`);

await browser.close();
