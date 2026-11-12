/** Inspect the capture console in the desktop window: what buttons exist, and what does it look like? */
import path from "node:path";
import { chromium } from "playwright";

const FIXTURE = process.argv[2];
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const context = browser.contexts()[0];
const page = context.pages().find((candidate) => candidate.url().includes("127.0.0.1:4120")) ?? context.pages()[0];

await page.goto(`http://127.0.0.1:4120/games/${FIXTURE}/live`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3_000);

const buttons = await page.evaluate(() =>
  Array.from(document.querySelectorAll("button")).map((button) => ({
    text: (button.textContent ?? "").trim().slice(0, 40),
    disabled: button.disabled,
    visible: button.offsetParent !== null,
    cls: button.className.slice(0, 60),
  })),
);
console.log(`url: ${page.url()}`);
console.log(`buttons: ${buttons.length}`);
for (const button of buttons.slice(0, 40)) {
  console.log(`  [${button.visible ? "v" : " "}]${button.disabled ? "d" : " "} "${button.text}" · ${button.cls}`);
}
const scores = await page.locator("p.text-5xl").allInnerTexts();
console.log(`scores: ${JSON.stringify(scores)}`);

await page.screenshot({ path: path.join("console-shot.png"), fullPage: false });
console.log("screenshot written");
await browser.close();
