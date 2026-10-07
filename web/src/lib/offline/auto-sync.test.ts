import assert from "node:assert/strict";
import test from "node:test";
import { startAutoSync } from "./auto-sync";
import type { SyncTrigger } from "./sync-trigger";

function fakeTrigger(): SyncTrigger & { fire: () => void; registered: boolean } {
  let onSync: (() => void) | null = null;
  return {
    name: "fake",
    supported: true,
    registered: false,
    register(cb) {
      onSync = cb;
      this.registered = true;
    },
    unregister() {
      onSync = null;
      this.registered = false;
    },
    async requestSync() {},
    fire() {
      onSync?.();
    },
  };
}

test("startAutoSync registers with the trigger and calls drain(deviceId) when the trigger fires", () => {
  const trigger = fakeTrigger();
  const drainCalls: string[] = [];
  const stop = startAutoSync("device-1", {
    trigger,
    drainFn: async (deviceId) => {
      drainCalls.push(deviceId);
      return { ok: true, attempted: 0, applied: 0, duplicate: 0, failed: 0, conflict: 0 };
    },
  });

  assert.equal(trigger.registered, true);
  assert.deepEqual(drainCalls, [], "nothing runs until the trigger actually fires");

  trigger.fire();
  assert.deepEqual(drainCalls, ["device-1"]);

  // A trigger firing repeatedly (online, then visibilitychange, then online again) must call
  // drain() again each time - this wiring itself does not dedupe; drain()'s own in-flight guard
  // is what makes an overlapping call a no-op, not this layer.
  trigger.fire();
  assert.deepEqual(drainCalls, ["device-1", "device-1"]);

  stop();
  assert.equal(trigger.registered, false, "stop() unregisters the trigger");
});

test("startAutoSync's cleanup prevents further drain() calls after the trigger is torn down", () => {
  const trigger = fakeTrigger();
  const drainCalls: string[] = [];
  const stop = startAutoSync("device-1", {
    trigger,
    drainFn: async (deviceId) => {
      drainCalls.push(deviceId);
      return { ok: true, attempted: 0, applied: 0, duplicate: 0, failed: 0, conflict: 0 };
    },
  });

  stop();
  trigger.fire(); // simulates an event arriving after unmount - the fake trigger clears its own
                   // callback on unregister, matching EventSyncAdapter's real unregister() behavior.
  assert.deepEqual(drainCalls, [], "no drain() call after the trigger has been unregistered");
});
