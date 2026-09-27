"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb } from "@/lib/offline/db";
import { createSyncTrigger, type SyncTrigger } from "@/lib/offline/sync-trigger";

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

function useSyncTrigger(): SyncTrigger | null {
  const trigger = useSyncTriggerRef().current;
  return trigger;
}

function useSyncTriggerRef(): { current: SyncTrigger | null } {
  const ref = useRef<SyncTrigger | null>(null);
  useEffect(() => {
    const instance = createSyncTrigger();
    ref.current = instance;
    instance.register(() => {});
    return () => instance.unregister();
  }, []);
  return ref;
}

export function SyncStatusBadge() {
  const mounted = useIsMounted();
  const online = useOnline();
  const trigger = useSyncTrigger();

  const pending = useLiveQuery(
    () => (mounted ? offlineDb.outbox.filter((r) => !r.syncedAt && !r.failureReason).count() : 0),
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

  const requestSync = useCallback(() => {
    void trigger?.requestSync();
  }, [trigger]);

  const pendingCount = pending ?? 0;
  const offline = !online;
  const showWarning = offline || pendingCount > 0;

  const label = offline
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
      title={lastSync ? `Last sync ${new Date(lastSync).toLocaleString()}` : "No sync yet"}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
        showWarning
          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${showWarning ? "bg-amber-400" : "bg-emerald-400"}`}
      />
      {label}
    </button>
  );
}
