/**
 * Desktop acceptance run, driven through WebView2's DevTools protocol.
 *
 * The shell is launched with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`, so Playwright attaches to the
 * real window: same session, same cookies, same agent.
 *
 * WHY BASKETBALL AND NOT FOOTBALL. The offline queue only covers the scorer's own scoring path (`recordScore`, rendered by
 * LiveScoreCapture as +1/+2/+3 with a player select). A football "Goal" button belongs to the catalog panel and submits
 * `recordSportEvent` — a different action with no offline branch, which is why five clicks on it queued nothing.
 *
 * WHY NOT `Network.emulateNetworkConditions({offline:true})`. It cuts loopback too, so the local agent becomes unreachable — a
 * state that cannot happen at a venue. The accurate simulation is `navigator.onLine = false` (what the console keys on) plus
 * aborting requests to the app origin, leaving 127.0.0.1:8012 alone.
 *
 * Run: node scripts/desktop-acceptance.mjs <basketballFixtureId>
 */
import { chromium } from "playwright";

const FIXTURE = process.argv[2];
if (!FIXTURE) throw new Error("usage: node scripts/desktop-acceptance.mjs <basketballFixtureId>");

const APP = "http://127.0.0.1:4120";
const EMAIL = "e2e-admin@ultraleagueos.test";
const PASSWORD = "E2E-test-password-2026";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const context = browser.contexts()[0];
const page = context.pages().find((candidate) => candidate.url().includes("127.0.0.1:4120")) ?? context.pages()[0];

async function signIn() {
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  if (await page.locator('input[name="email"]').count()) {
    await page.locator('input[name="email"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /access system/i }).click();
    await page.waitForSelector('input[name="password"]', { state: "detached", timeout: 40_000 });
    console.log("signed in");
  }
}

async function openConsole() {
  await page.goto(`${APP}/games/${FIXTURE}/live`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("p.text-5xl", { timeout: 30_000 });
  const scores = await page.locator("p.text-5xl").allInnerTexts();
  console.log(`console open · scores ${JSON.stringify(scores)}`);
}

try {
  await signIn();
  await openConsole();

  // The scorer's own panel: a per-team player select plus +1/+2/+3. Selecting a player is optional (the first option is "Team
  // score / unknown player"), but a real scorer picks one, so the test does too.
  const playerSelect = page.locator('select[id^="player-"]').first();
  if (await playerSelect.count()) {
    const options = await playerSelect.locator("option").count();
    if (options > 1) {
      await playerSelect.selectOption({ index: 1 });
      console.log(`player selected: ${await playerSelect.locator("option").nth(1).innerText()}`);
    }
  }

  // Offline: the app is unreachable, the agent is not.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "onLine", { get: () => false, configurable: true });
  });
  await context.route(`${APP}/**`, (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("p.text-5xl", { timeout: 30_000 });
  console.log(`offline: onLine=${await page.evaluate(() => navigator.onLine)}`);

  const plusTwo = page.getByRole("button", { name: "+2", exact: true }).first();
  if (!(await plusTwo.count())) {
    const names = await page.getByRole("button").allInnerTexts();
    throw new Error(`no +2 button · page offers: ${names.slice(0, 24).join(" / ")}`);
  }
  for (let index = 0; index < 5; index++) {
    await plusTwo.click({ force: true });
    await page.waitForTimeout(700);
  }
  console.log("taps: 5 × +2");
  await page.waitForTimeout(2_500);

  const acknowledgments = await page.evaluate(() =>
    Array.from(document.querySelectorAll("p"))
      .map((element) => element.textContent?.trim() ?? "")
      .filter((text) => /offline|captur|queued|sync/i.test(text))
      .slice(0, 4),
  );
  console.log(`console feedback: ${JSON.stringify(acknowledgments)}`);

  // Back online, then sync.
  await context.unroute(`${APP}/**`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("p.text-5xl", { timeout: 30_000 });
  console.log(`online: onLine=${await page.evaluate(() => navigator.onLine)}`);

  const badge = page.getByRole("button", { name: /pending|offline|synced|sync/i }).first();
  if (await badge.count()) {
    await badge.click({ force: true }).catch(() => {});
    console.log("clicked the sync badge");
  } else {
    console.log("no sync badge within reach");
  }
  await page.waitForTimeout(10_000);
} finally {
  await browser.close();
}
