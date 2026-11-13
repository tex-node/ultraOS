/** Cache-busting check: does the deployed console emit agent traffic on mount? */
import { chromium } from "playwright";

const APP = "http://127.0.0.1:4120";
const FIXTURE = process.argv[2];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const context = browser.contexts()[0];
const page = context.pages()[0];

const seen = [];
page.on("request", (request) => {
  const url = request.url();
  if (url.includes("/api/desktop/agent-token") || url.includes("8012/handshake") || url.includes("8012/api/local/agent")) {
    seen.push(`${request.method()} ${url.split("/").slice(0, 3).join("/")}${url.replace(/^https?:\/\/[^/]+/, "")}`);
  }
});

await page.goto(`${APP}/games/${FIXTURE}/live?bust=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("p.text-5xl", { timeout: 30_000 });
await page.waitForTimeout(5_000);

const banner = await page.evaluate(() => {
  const element = document.querySelector('[role="status"]');
  return element ? (element.textContent ?? "").trim() : null;
});

console.log(`traffic: ${seen.length ? JSON.stringify(seen, null, 0) : "(none)"}`);
console.log(`banner: ${banner === null ? "not shown" : JSON.stringify(banner)}`);
console.log(`status element present: ${await page.evaluate(() => Boolean(document.querySelector('[role="status"]')))}`);

await browser.close();
