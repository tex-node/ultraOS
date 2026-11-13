/**
 * Desktop acceptance run — the whole loop, in one script.
 *
 *   console (basketball) → offline taps → SQLite rows (syncedAt NULL) → reconnect → sync from the stats page (where the badge
 *   lives) → SQLite rows (syncedAt set)
 *
 * The window is the real shell: Playwright attaches over WebView2's DevTools port, so the page, the session, the agent token and
 * the SQLite file are the ones a scorer would use.
 *
 * Offline is simulated the faithful way: `navigator.onLine = false` plus an `offline` event (the console keys on the event, not the
 * property) and aborted data requests, leaving the loopback agent reachable — which is what a venue laptop actually experiences.
 *
 * Run: node scripts/desktop-acceptance.mjs <basketballFixtureId>
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";

const FIXTURE = process.argv[2];
if (!FIXTURE) throw new Error("usage: node scripts/desktop-acceptance.mjs <basketballFixtureId>");

const APP = "http://127.0.0.1:4120";
const EMAIL = "e2e-admin@ultraleagueos.test";
const PASSWORD = "E2E-test-password-2026";
const DB = path.join(process.env.APPDATA, "ng.neonultra.scoring", "ultraos", "outbox.db");
const PYTHON = "C:\\Users\\XPS\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe";

function sql(query) {
  const script = [
    "import sqlite3, sys",
    "rows = list(sqlite3.connect(sys.argv[1]).execute(sys.argv[2]))",
    "print('\\n'.join(' | '.join('NULL' if v is None else str(v) for v in row) for row in rows) or '(no rows)')",
  ].join("\n");
  return execFileSync(PYTHON, ["-c", script, DB, query], { encoding: "utf8" }).trim();
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const context = browser.contexts()[0];
const page = context.pages()[0];

try {
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  if (await page.locator('input[name="email"]').count()) {
    await page.locator('input[name="email"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /access system/i }).click();
    await page.waitForSelector('input[name="password"]', { state: "detached", timeout: 40_000 });
    console.log("signed in");
  }

  await page.goto(`${APP}/games/${FIXTURE}/live`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("p.text-5xl", { timeout: 30_000 });
  console.log(`console open · scores ${JSON.stringify(await page.locator("p.text-5xl").allInnerTexts())}`);

  const playerSelect = page.locator('select[id^="player-"]').first();
  if ((await playerSelect.count()) && (await playerSelect.locator("option").count()) > 1) {
    await playerSelect.selectOption({ index: 1 });
  }

  console.log(`before taps (file): ${sql("SELECT count(*), sum(syncedAt IS NULL) FROM outbox")}`);

  // Offline: data requests to the app are cut, the agent stays reachable.
  await context.route(`${APP}/**`, (route) => {
    const type = route.request().resourceType();
    if (["document", "script", "stylesheet", "font", "image"].includes(type)) return route.continue();
    return route.abort();
  });
  await page.evaluate(() => {
    Object.defineProperty(Navigator.prototype, "onLine", { get: () => false, configurable: true });
    window.dispatchEvent(new Event("offline"));
  });

  for (let index = 0; index < 5; index++) {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((candidate) =>
        /^\+2/.test((candidate.textContent ?? "").trim()),
      );
      button?.click();
    });
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2_500);

  const feedback = await page.evaluate(() =>
    Array.from(document.querySelectorAll("p"))
      .map((element) => element.textContent?.trim() ?? "")
      .filter((text) => /offline|captur|queued/i.test(text))
      .slice(0, 3),
  );
  console.log(`console feedback: ${JSON.stringify(feedback)}`);
  console.log("after taps (file, expect 5 rows with syncedAt NULL):");
  console.log(sql("SELECT idempotencyKey, entityType, attemptCount, syncedAt FROM outbox ORDER BY localId"));

  // Reconnect and sync from the stats page, which is the only page that renders the sync badge.
  await context.unroute(`${APP}/**`);
  await page.goto(`${APP}/games/${FIXTURE}/stats`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    Object.defineProperty(Navigator.prototype, "onLine", { get: () => true, configurable: true });
    window.dispatchEvent(new Event("online"));
  });
  await page.waitForTimeout(2_000);
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) =>
      /local agent|online|pending|synced/i.test(candidate.textContent ?? ""),
    );
    button?.click();
    return button ? (button.textContent ?? "").trim() : "no badge";
  });
  console.log(`sync: clicked "${clicked}"`);
  await page.waitForTimeout(15_000);

  console.log("after sync (expect syncedAt set):");
  console.log(sql("SELECT idempotencyKey, attemptCount, syncedAt FROM outbox ORDER BY localId"));
  const remaining = sql("SELECT count(*) FROM outbox WHERE syncedAt IS NULL");
  console.log(`unsynced remaining: ${remaining}`);
} finally {
  await browser.close();
}
