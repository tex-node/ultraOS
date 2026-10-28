import { BackgroundSyncAdapter, EventSyncAdapter, createSyncTrigger, SCORING_SYNC_TAG } from "./sync-trigger";
import assert from "node:assert/strict";
import test from "node:test";

test("SCORING_SYNC_TAG is the stable background-sync tag A3 and the SW agree on", () => {
  assert.equal(SCORING_SYNC_TAG, "scoring-sync");
});

test("createSyncTrigger falls back to the event adapter when Background Sync is unavailable (Node/Safari-like)", () => {
  const trigger = createSyncTrigger();
  // In the Node test environment there is no service worker, so the fallback must be chosen.
  assert.equal(trigger.name, "event-fallback");
  assert.equal(trigger.supported, false);
});

test("BackgroundSyncAdapter reports unsupported with no service worker / SyncManager", () => {
  const adapter = new BackgroundSyncAdapter();
  assert.equal(adapter.supported, false);
  assert.equal(adapter.name, "background-sync");
});

test("BackgroundSyncAdapter.requestSync rejects cleanly when unsupported", async () => {
  const adapter = new BackgroundSyncAdapter();
  await assert.rejects(() => adapter.requestSync(), /BACKGROUND_SYNC_UNSUPPORTED/);
});

test("EventSyncAdapter register/unregister are safe no-ops outside the browser", () => {
  const adapter = new EventSyncAdapter();
  assert.doesNotThrow(() => adapter.register(() => {}));
  assert.doesNotThrow(() => adapter.unregister());
});

// A5 Step 8 regression: the Chromium adapter must drain IN THE TAB on reconnect, not only ask the service worker to.
// The bug this pins is subtle and was found by the offline e2e, not by a unit test: BackgroundSyncAdapter.register() was
// empty, so on Chromium (where createSyncTrigger picks it) nothing ever drained when the network came back.
test("BackgroundSyncAdapter.register wires an online listener even though it also uses Background Sync", () => {
  const listeners: Record<string, (() => void)[]> = {};
  const fakeWindow = {
    addEventListener: (type: string, handler: () => void) => {
      (listeners[type] ??= []).push(handler);
    },
    removeEventListener: (type: string, handler: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((candidate) => candidate !== handler);
    },
  };
  const documentListeners: Record<string, (() => void)[]> = {};
  const fakeDocument = {
    visibilityState: "visible",
    addEventListener: (type: string, handler: () => void) => {
      (documentListeners[type] ??= []).push(handler);
    },
    removeEventListener: (type: string, handler: () => void) => {
      documentListeners[type] = (documentListeners[type] ?? []).filter((candidate) => candidate !== handler);
    },
  };
  const scope = globalThis as { window?: unknown; document?: unknown };
  const originalWindow = scope.window;
  const originalDocument = scope.document;
  scope.window = fakeWindow;
  scope.document = fakeDocument;
  try {
    const adapter = new BackgroundSyncAdapter();
    let fired = 0;
    adapter.register(() => {
      fired += 1;
    });
    assert.equal(listeners.online?.length, 1, "the online listener must be registered");
    listeners.online![0]!();
    assert.equal(fired, 1, "reconnecting must drain in the tab");
    adapter.unregister();
    assert.equal(listeners.online?.length, 0, "unregister must remove the listener");
  } finally {
    scope.window = originalWindow;
    scope.document = originalDocument;
  }
});