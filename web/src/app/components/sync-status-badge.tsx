"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb } from "@/lib/offline/db";
import { drain, retryDeadLetteredRecords } from "@/lib/offline/outbox";
import { startAutoSync } from "@/lib/offline/auto-sync";
import { getOrCreateDeviceId } from "@/lib/offline/device-id";

// Browser-only browser-API subscriptions via useSyncExternalStore: no setState-in-effect, and a
// correct server snapshot (true / not-yet-mounted) so SSR never touches navigator or Dexie.
const emptySubscribe = () => () => {};

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function useIsMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

function useDeviceId(): { current: string | null } {
  const ref = useRef<string | null>(null);
  useEffect(() => {
    ref.current = getOrCreateDeviceId();
  }, []);
  return ref;
}

// Registers the actual online/visibilitychange (or Background Sync) wiring for the lifetime of
// this component - see auto-sync.ts. Nothing in this hook duplicates that logic; it only owns the
// mount/unmount lifecycle so a second render doesn't register a second listener.
function useAutoSync(deviceIdRef: { current: string | null }): void {
  useEffect(() => {
    const deviceId = deviceIdRef.current ?? getOrCreateDeviceId();
    return startAutoSync(deviceId);
  }, [deviceIdRef]);
}

export function SyncStatusBadge() {
  const mounted = useIsMounted();
  const online = useOnline();
  const deviceIdRef = useDeviceId();
  useAutoSync(deviceIdRef);

  // Pending means "not yet synced and not dead-lettered" - matches outbox.ts's
  // readPendingBatch/pendingCount exactly, so this badge's count is always what the next drain()
  // would actually attempt, not a superset that includes records drain() has already given up on.
  const pending = useLiveQuery(
    () => (mounted ? offlineDb.outbox.filter((r) => !r.syncedAt && !r.deadLetteredAt).count() : 0),
    [mounted],
    null,
  );

  // Dead-lettered: failed DEAD_LETTER_ATTEMPT_THRESHOLD times, no longer retried automatically.
  // This is what makes the badge actually useful as a signal, not just a spinner - a scorekeeper
  // needs to know when something needs their attention, not just "still working on it."
  const deadLettered = useLiveQuery(
    () => (mounted ? offlineDb.outbox.filter((r) => Boolean(r.deadLetteredAt)).count() : 0),
    [mounted],
    null,
  );

  const lastSync = useLiveQuery(
    async () => {
      if (!mounted) return null;
      const synced = await offlineDb.outbox.filter((r) => Boolean(r.syncedAt)).toArray();
      if (synced.length === 0) return null;
      return synced.map((r) => r.syncedAt as string).sort().at(-1) ?? null;
    },
    [mounted],
    null,
  );

  const deadLetterCount = deadLettered ?? 0;

  // Calls drain() directly rather than through SyncTrigger.requestSync(): on Chromium,
  // requestSync() only registers a Background Sync tag for the service worker to handle later,
  // which is right for "wake me up if the tab closes" but wrong for a button the scorekeeper just
  // clicked expecting an immediate sync in the current tab.
  //
  // When there's anything dead-lettered, the click first resets it back to a retryable state
  // (retryDeadLetteredRecords) before draining - a manual retry is the only way a dead-lettered
  // record ever gets attempted again, since the automatic trigger path deliberately skips it.
  const requestSync = useCallback(() => {
    const deviceId = deviceIdRef.current ?? getOrCreateDeviceId();
    void (async () => {
      if (deadLetterCount > 0) {
        await retryDeadLetteredRecords();
      }
      await drain(deviceId);
    })();
  }, [deviceIdRef, deadLetterCount]);

  const pendingCount = pending ?? 0;
  const offline = !online;
  const needsAttention = deadLetterCount > 0;
  const showWarning = offline || pendingCount > 0 || needsAttention;

  const label = needsAttention
    ? `${deadLetterCount} failed · Retry`
    : offline
      ? `Offline${pendingCount > 0 ? ` · ${pendingCount} pending` : ""}`
      : pendingCount > 0
        ? `${pendingCount} pending sync`
        : lastSync
          ? "Synced"
          : "Online";

  return (
    <button
      type="button"
      onClick={requestSync}
      title={
        needsAttention
          ? `${deadLetterCount} record${deadLetterCount === 1 ? "" : "s"} failed to sync after multiple attempts - click to retry`
          : lastSync
            ? `Last sync ${new Date(lastSync).toLocaleString()}`
            : "No sync yet"
      }
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
        needsAttention
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : showWarning
            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${needsAttention ? "bg-red-400" : showWarning ? "bg-amber-400" : "bg-emerald-400"}`}
      />
      {label}
    </button>
  );
}
