# Component-level (jsdom) testing in this project

This project's test suites (`npm test`, `npm run test:db`) are `node:test` files with no DOM -
pure logic and service-layer tests against real Postgres, no browser, no React rendering. The first
component-level test (`src/app/components/sync-status-badge.test.tsx`, A4 PR 1/2) needed to render
a real component into a real DOM to prove a real browser event reaches a real callback - something
a service-layer test structurally cannot prove (it can show a callback does the right thing *when
called*, never that anything calls it - see session.md's "shipped but not wired" entries,
2026-09-28, for why that gap mattered here specifically).

Building that first test surfaced three real, generalizable bugs. Each one will bite the next
component test in this project - most immediately, A4 PR 3's admin page (a record list plus
per-record action controls, a materially bigger DOM than a status badge). Read this before writing
one.

## 1. Never hand-roll jsdom global installation

The instinct is to construct a `JSDOM` instance and copy its `window`'s own properties onto
`globalThis`. Don't. It is a real whack-a-mole:

- Overwriting Node's native `setTimeout`/`setInterval`/`queueMicrotask` with jsdom's window-scoped
  versions **silently hangs the whole test process** instead of failing loudly - jsdom's timers
  don't pump the same way outside jsdom's own resource loop. This is the most dangerous class of
  bug in test infrastructure: a hang gives no stack trace to start debugging from.
- jsdom's `window.console` is a partial stub missing methods React-dom's development build calls
  internally (e.g. `console.timeStamp`), causing a real crash if copied over Node's console.
- Node's own `navigator` is a getter-only global; plain assignment throws.
- Node has its own built-in `Event`/`EventTarget` classes (since Node 18); jsdom's own DOM tree only
  accepts instances of *its own* `Event` class, so `dispatchEvent(new Event(...))` silently fails
  with a type error unless the `Event` used is jsdom's (`window.Event`), not the ambient global one.

Use `global-jsdom` (a maintained package solving exactly this) instead:

```ts
import globalJsdom from "global-jsdom";
globalJsdom(undefined, { url: "http://localhost/" });
```

Even so, dispatch DOM events using the window's own constructors where Node has a same-named
built-in (`new window.Event("online")`, not `new Event("online")`) - `global-jsdom` copies a
window property only when Node doesn't already have one by that name, so a same-named Node global
is deliberately left alone.

## 2. Import hoisting constructs singletons before `window` exists

ES module `import` declarations are hoisted above all other top-level code **in the same file**,
regardless of source order. A statically-imported module-level singleton (this project's
`offlineDb` in `src/lib/offline/db.ts`, constructed via `export const offlineDb = new
OfflineScoringDatabase()` at module scope) will be constructed during that hoisted-import phase -
**before** a same-file, plain-statement call to `globalJsdom()` ever runs, even if that call is
written textually above the `import`.

Symptom: `useLiveQuery` (or any Dexie-dependent code) behaves as if nothing is happening - Dexie
initialized itself in a windowless environment and nothing downstream ever recovers.

Fix: call `globalJsdom()` as a plain statement, then import everything that needs jsdom already
installed **dynamically** (`await import(...)`), which is not hoisted and genuinely runs after:

```ts
import globalJsdom from "global-jsdom";
import "fake-indexeddb/auto"; // no window dependency - fine as a static import

globalJsdom(undefined, { url: "http://localhost/" });
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

async function main() {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { SyncStatusBadge } = await import("./sync-status-badge");
  const { offlineDb } = await import("@/lib/offline/db");
  // ...test() registrations go here...
}

// Not `await main()`: this project's test files transpile to CommonJS (no "type": "module" in
// package.json), and esbuild rejects top-level await in CJS output. node:test tolerates
// asynchronous test() registration - it collects tests as they're registered for as long as a live
// promise chain keeps the module active.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Run this project's `test:component` npm script with `--test-force-exit`: `EventSyncAdapter`
(`src/lib/offline/sync-trigger.ts`) runs a real, un-`unref`'d `setInterval` for its periodic-poll
fallback - correct for a real browser tab, but it can otherwise hold the process's event loop open
after tests finish.

## 3. `act()` must wrap each poll tick, not the whole wait loop

When a test polls for a DOM value driven by a React re-render (`useLiveQuery`'s result appearing in
rendered text, for instance), wrapping the *entire* polling loop in one `act()` call does not work:

```ts
// WRONG - never sees an intermediate commit while this act() is still running
await act(async () => {
  while (!button.textContent.includes("failed")) {
    await new Promise((r) => setTimeout(r, 0));
  }
});
```

React defers committing a state update triggered from outside its own event handlers - exactly
what a Dexie `liveQuery` observable firing is - until the current `act()` scope closes. A `act()`
that is still executing (because it's in the middle of a `while` loop) never lets React flush the
intermediate commit the loop is waiting to observe, so the condition can never become true and the
loop spins until it times out. Confirmed by bisecting against a minimal repro where the *only*
difference was one `act()` around the whole loop versus one `act()` per tick.

Fix: call `act()` once per tick, not once around the loop:

```ts
async function waitForRender(
  act: (fn: () => void | Promise<void>) => void | Promise<void>,
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitForRender: condition never became true within ${timeoutMs}ms`);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}
```

A condition that only reads a plain external value (a `fetch`-call counter, an array length) does
not need this - it isn't reading anything React committed, so a single surrounding `act()` around
the whole wait is fine. Reserve the per-tick version for conditions that read rendered DOM content.

## A fourth thing, not jsdom-specific: check what the seed data already satisfies

A wait condition checked directly against a record's *current* field value can be trivially true
before the thing being tested has run at all - for example, waiting for `attemptCount > 0` on a
record seeded with `attemptCount: 5` (past a dead-letter threshold). The wait resolves instantly,
the test "passes" within milliseconds, and the actual behavior under test never ran. Wait for the
externally observable effect of the action instead (a `fetch` call happening, a specific new value
being reached), not a condition the seed data already satisfies.
