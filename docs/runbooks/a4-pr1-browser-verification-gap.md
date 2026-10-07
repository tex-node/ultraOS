# A4 PR 1 (sync trigger wiring): residual browser-verification gap

`SyncStatusBadge`'s online/`visibilitychange`-triggered `drain()` wiring (see
`docs/canonical-write-audit.md`) is covered by:

- Unit tests for the extracted logic (`startAutoSync`, `getOrCreateDeviceId`, `drain` itself).
- A component-level test (`src/app/components/sync-status-badge.test.tsx`) that renders the real
  component into a real DOM via `jsdom`/`global-jsdom`, dispatches a real `window` `online` event,
  and asserts the resulting `fetch` call - the first test in this project able to prove a DOM event
  actually reaches a callback, not just that the callback does the right thing when called directly.

## What is still unverified

The component test runs under `jsdom`, not a real browser. Specifically unverified:

- **Real Chromium/Safari `visibilitychange` timing** - jsdom's event dispatch is synchronous and
  immediate; a real browser's tab-focus lifecycle may have timing this test cannot represent.
- **`BackgroundSyncAdapter`'s actual path** - jsdom has no `serviceWorker`/`SyncManager`, so
  `createSyncTrigger()` always falls back to `EventSyncAdapter` in this test. The Background Sync
  tag registration path (Chromium only) has never been exercised against a real service worker.
- **The manual "Sync now" button and the pending-count badge as an actual scorekeeper would see
  them** - font rendering, tap targets, and real network latency are all out of scope for a jsdom
  test.

## Why this wasn't closed by logging into staging

Entering a real login password into a browser session is prohibited regardless of authorization -
the same standing constraint every other verification step in this project's A3a/A3b work has
followed (see `a3a-batch10-12-smoke-test.md`).

## What would close it

A dedicated, low-privilege QA account on staging, scoped to a single test game, would let someone
(not necessarily this assistant, given the login-credential constraint) run the full path once: load
the game stats page on a real tablet browser, go offline, score an event, come back online, confirm
the badge updates and the event lands server-side. If such an account becomes available before A4
closes, run this once. Until then, this gap is documented, not silently assumed closed.
