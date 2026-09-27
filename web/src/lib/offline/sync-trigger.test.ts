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
