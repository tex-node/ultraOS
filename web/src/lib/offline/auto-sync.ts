import { createSyncTrigger, type SyncTrigger } from "./sync-trigger";
import { drain, type DrainOutcome } from "./outbox";

export interface StartAutoSyncOptions {
  trigger?: SyncTrigger;
  drainFn?: (deviceId: string) => Promise<DrainOutcome>;
}

// A4 PR 1: wires sync-trigger.ts's SyncTrigger (built in A2, unwired until now - its own onSync
// callback was a no-op) to the actual drain(). Every online/visibilitychange event (or, on
// Chromium, the Background Sync tag) fires the SAME registered callback, so this one wiring point
// covers both triggers. No debounce, no timer: drain()'s own in-flight guard already makes a
// second concurrent call a no-op, and the trigger events themselves are the retry cadence - a
// device that failed to sync gets another attempt the next time it regains connectivity or the tab
// regains focus, not on a fixed schedule. A timer-based backoff is deferred until production logs
// show a real device going stale without either trigger firing.
//
// Returns a plain cleanup function (unregisters the trigger) rather than exposing the trigger
// itself - callers that need an immediate manual sync should call drain() directly (see
// SyncStatusBadge's "Sync now" button), not go through SyncTrigger.requestSync(), whose Chromium
// implementation only registers a Background Sync tag for the service worker to handle later - not
// a synchronous drain in the current tab, which is what a manual button click needs.
export function startAutoSync(deviceId: string, options: StartAutoSyncOptions = {}): () => void {
  const trigger = options.trigger ?? createSyncTrigger();
  const drainFn = options.drainFn ?? drain;
  trigger.register(() => {
    void drainFn(deviceId);
  });
  return () => trigger.unregister();
}
