// This is the first component-level (jsdom) test in this project - added specifically to close a
// blind spot the "shipped but not wired" pattern exposed (see session.md, 2026-09-28): the service-
// layer tests that verify drain()/startAutoSync in isolation can prove the callback does the right
// thing when called, but cannot prove a real browser event actually reaches it. This test renders
// the real component into a real DOM (jsdom), dispatches a real `online` event, and asserts the
// resulting network call - the one thing no service-layer test can see.
import assert from "node:assert/strict";
import test from "node:test";
import globalJsdom from "global-jsdom";
// Static, not dynamic: this has no window/jsdom dependency (it only installs `indexedDB` on the
// global object), so ordinary import hoisting is fine here - it still runs before any of the
// dynamic imports below, which is all that matters (Dexie must see `indexedDB` before it
// constructs `offlineDb`).
import "fake-indexeddb/auto";

// jsdom globals must exist before anything imports React/Dexie/the component, since db.ts's
// `offlineDb` singleton and React's client renderer both branch on `typeof window`/`document` at
// module-init time. A plain top-level `import ... from "..."` for those modules would NOT be safe
// here even placed textually after this call: ES module `import` declarations are hoisted above
// all other top-level code in the same file, so a statically-imported `offlineDb` would already
// have been constructed - before `window` existed - regardless of source order. Confirmed by
// hitting exactly this: `useLiveQuery` subscriptions never resolved, because Dexie had already
// initialized itself in a windowless environment. Every module that needs jsdom already installed
// is therefore imported dynamically (`await import(...)`) below, after this call, not statically.
//
// Hand-rolling the jsdom global installation itself (copying `window`'s own properties onto
// `globalThis`) was also tried and abandoned: a real whack-a-mole (overwriting Node's
// setTimeout/setInterval with jsdom's window-scoped versions silently hangs the whole process
// instead of failing loudly; jsdom's window.console is missing methods React-dom's dev build
// calls; Node's own `navigator` is a getter-only global plain assignment can't overwrite; and so
// on) that `global-jsdom` - a maintained package solving exactly this problem - already handles.
globalJsdom(undefined, { url: "http://localhost/" });
// React 19's act() refuses to run unless this flag is set - there is no default test-runner
// integration (like Jest's) that sets it automatically here.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Polls a plain external condition (an array length, a fetch-call count) that doesn't require
// reading React-rendered DOM content - a single surrounding act() from the caller is enough here,
// since nothing needs to observe an intermediate React commit mid-loop.
async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor: condition never became true within ${timeoutMs}ms`);
    await flushMicrotasks();
  }
}

// Polls a condition that reads React-rendered DOM content (e.g. button.textContent driven by a
// useLiveQuery re-render) - each tick needs its OWN act() call, not one act() wrapped around the
// whole loop. Confirmed by bisecting a real failure: wrapping the entire poll in a single act()
// left button.textContent stuck at its pre-update value for the loop's whole duration, even though
// a direct query against the same database returned the correct new value immediately - React
// defers committing a state update triggered from outside its own event handlers (exactly what a
// Dexie liveQuery observable firing does) until the current act() scope closes, so a still-running
// outer act() never sees the intermediate commit.
async function waitForRender(act: (fn: () => void | Promise<void>) => void | Promise<void>, condition: () => boolean | Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitForRender: condition never became true within ${timeoutMs}ms`);
    await act(flushMicrotasks);
  }
}

async function main() {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { SyncStatusBadge } = await import("./sync-status-badge");
  const { offlineDb } = await import("@/lib/offline/db");
  const { DEAD_LETTER_ATTEMPT_THRESHOLD, enqueue } = await import("@/lib/offline/outbox");

  async function mount(): Promise<{ container: HTMLDivElement; unmount: () => void }> {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<SyncStatusBadge />);
    });
    return {
      container,
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  }

  test.beforeEach(async () => {
    await offlineDb.outbox.clear();
  });

  test("mounting SyncStatusBadge and firing a real 'online' event reaches drain() - proves the wiring, not just the callback", async () => {
    await enqueue({ entityType: "Game", entityId: "g1", operation: "CREATE", payload: { fixtureId: "f1" }, deviceId: "device-test-1" }, offlineDb);

    const fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as typeof fetch;

    const { unmount } = await mount();
    try {
      assert.deepEqual(fetchCalls, [], "no sync attempt before any trigger fires");

      await act(async () => {
        window.dispatchEvent(new window.Event("online"));
        await waitFor(() => fetchCalls.length > 0);
      });

      assert.equal(fetchCalls.length, 1, "a real 'online' DOM event must reach drain(), which must call fetch exactly once");
      assert.match(fetchCalls[0], /\/api\/sync\/outbox$/);
    } finally {
      unmount();
      globalThis.fetch = originalFetch;
    }
  });

  test("clicking 'Sync now' calls drain() immediately, without waiting for a trigger event", async () => {
    await enqueue({ entityType: "Game", entityId: "g2", operation: "CREATE", payload: { fixtureId: "f2" }, deviceId: "device-test-2" }, offlineDb);

    const fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as typeof fetch;

    const { container, unmount } = await mount();
    try {
      const button = container.querySelector("button");
      assert.ok(button, "the badge must render a clickable button");

      await act(async () => {
        button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await waitFor(() => fetchCalls.length > 0);
      });

      assert.equal(fetchCalls.length, 1, "clicking the button must trigger exactly one sync attempt");
    } finally {
      unmount();
      globalThis.fetch = originalFetch;
    }
  });

  test("after unmount, a subsequent 'online' event no longer reaches drain() - the listener was actually removed", async () => {
    await enqueue({ entityType: "Game", entityId: "g3", operation: "CREATE", payload: { fixtureId: "f3" }, deviceId: "device-test-3" }, offlineDb);

    const fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls.push("called");
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as typeof fetch;

    const { unmount } = await mount();
    unmount();

    try {
      await act(async () => {
        window.dispatchEvent(new window.Event("online"));
        await flushMicrotasks();
      });
      assert.deepEqual(fetchCalls, [], "a stale listener firing after unmount would be a real leak - it must not happen");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("a dead-lettered record shows a distinct 'needs attention' state, and clicking retries it", async () => {
    const localId = await enqueue({ entityType: "Game", entityId: "bad-fk", operation: "CREATE", payload: { fixtureId: "f4" }, deviceId: "device-test-4" }, offlineDb);
    // Seeded directly in the already-dead-lettered state (the threshold-counting mechanics
    // themselves are proven in outbox.test.ts) - this test's job is the badge's reaction to that
    // state and the retry interaction, not re-proving the count.
    await offlineDb.outbox.update(localId, { attemptCount: DEAD_LETTER_ATTEMPT_THRESHOLD, deadLetteredAt: new Date().toISOString() });

    const fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as typeof fetch;

    const { container, unmount } = await mount();
    try {
      const button = container.querySelector("button")!;
      // useLiveQuery's first real (non-null) result arrives asynchronously - poll (with a
      // per-tick act(), see waitForRender's own comment) rather than assuming any fixed number of
      // flush cycles is enough.
      await waitForRender(act, () => (button.textContent ?? "").includes("failed"));
      assert.match(button.textContent ?? "", /1 failed/, "the badge must surface the dead-letter count, not just a generic pending count");
      assert.match(button.className, /border-red-500/, "the dead-lettered state must be visually distinct (red), not the same amber as ordinary pending");

      act(() => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // Waits for the actual fetch call, not "attemptCount > 0" - the seeded record already starts
      // at attemptCount 5 (past the threshold), so that condition would already have been true
      // before the click's retry+drain logic ever ran.
      await waitForRender(act, () => fetchCalls.length > 0);
      // And then for drain()'s post-fetch effect (its markFailed write) to actually land - the
      // fetch call resolving and the resulting IndexedDB write are two separate async steps.
      await waitForRender(act, async () => ((await offlineDb.outbox.get(localId))?.attemptCount ?? 0) === 1);

      assert.equal(fetchCalls.length, 1, "clicking must retry (reset) the dead-lettered record and then drain it again");
      const record = await offlineDb.outbox.get(localId);
      assert.equal(record?.attemptCount, 1, "the retry reset attemptCount to 0, and the drain() that followed made exactly one fresh attempt");
      assert.equal(record?.deadLetteredAt, null, "no longer dead-lettered after a manual retry");
    } finally {
      unmount();
      globalThis.fetch = originalFetch;
    }
  });
}

// Not `await main()`: this file is transpiled to CommonJS (no "type": "module" in package.json),
// and esbuild rejects top-level await in CJS output. node:test tolerates asynchronous test()
// registration - it collects tests as they're registered for as long as a live promise chain
// keeps the module active, which this one does until every dynamic import and test() call inside
// main() has run.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
