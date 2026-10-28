// Sync trigger abstraction (P13 / A2). Background Sync is Chromium-only; Safari has no support,
// so the event-based fallback is the primary path for iPad scorekeepers, not an afterthought.
// A manual "Sync now" trigger is added in A4 — this interface is the seam it plugs into.
export interface SyncTrigger {
  readonly name: string;
  readonly supported: boolean;
  register(onSync: () => void): void;
  unregister(): void;
  requestSync(): Promise<void>;
}

export const SCORING_SYNC_TAG = "scoring-sync";

type SyncManagerLike = {
  register(tag: string): Promise<void>;
};

type ServiceWorkerRegistrationWithSync = ServiceWorkerRegistration & {
  sync?: SyncManagerLike;
};

function getRegistration(): ServiceWorkerRegistrationWithSync | null {
  if (typeof navigator === "undefined") return null;
  return navigator.serviceWorker?.controller
    ? (navigator.serviceWorker.controller as unknown as ServiceWorkerRegistrationWithSync)
    : null;
}

// Chromium: registers the Background Sync tag so the browser delivers the sync even if the tab
// is closed. The service worker itself does the drain; this only requests the wake-up.
export class BackgroundSyncAdapter implements SyncTrigger {
  readonly name = "background-sync";

  // A5 Step 8 BUG FIX (2026-10-28): `register()` used to be an empty method on the theory that the service worker's
  // `sync` event would do the drain. It does - but only AFTER something calls `registration.sync.register(tag)`, and the
  // only caller of requestSync() was a manual "Sync now" button. On Chromium, therefore, a tablet that scored offline and
  // reconnected drained NOTHING until the operator pressed a button: the e2e proof (offline tap -> reconnect -> expect the
  // score to move) sat at outbox=1 and zero requests to /api/sync/outbox for 30 s.
  //
  // Two things now happen in the tab, and the background tag is requested as well so a closed tab is still covered:
  //   - `online` / `visibilitychange` drain immediately (the same wiring the Safari fallback has);
  //   - each of those also registers the Background Sync tag, which is what wakes the SW if the tab dies first.
  private onSync: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

  get supported(): boolean {
    if (typeof navigator === "undefined") return false;
    return "serviceWorker" in navigator && "SyncManager" in globalThis;
  }

  register(onSync: () => void): void {
    if (typeof window === "undefined") return;
    this.onSync = onSync;
    const fire = () => {
      onSync();
      // Best effort: a browser that refuses the tag is exactly the browser whose listener above still drained.
      void this.requestSync().catch(() => undefined);
    };
    this.onlineHandler = fire;
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible" && navigator.onLine) fire();
    };
    window.addEventListener("online", this.onlineHandler);
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  unregister(): void {
    if (typeof window === "undefined") return;
    if (this.onlineHandler) window.removeEventListener("online", this.onlineHandler);
    if (this.visibilityHandler) document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.onSync = null;
    this.onlineHandler = null;
    this.visibilityHandler = null;
  }

  async requestSync(): Promise<void> {
    if (!this.supported) throw new Error("BACKGROUND_SYNC_UNSUPPORTED");
    const registration = getRegistration();
    if (!registration?.sync) throw new Error("NO_SYNC_MANAGER");
    await registration.sync.register(SCORING_SYNC_TAG);
  }
}

// Fallback for Safari (and any browser without Background Sync): fires `onSync` when the tab
// regains connectivity or returns to the foreground, plus an optional periodic poll while online.
export class EventSyncAdapter implements SyncTrigger {
  readonly name = "event-fallback";
  readonly supported = typeof window !== "undefined";
  private onSync: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  register(onSync: () => void): void {
    if (typeof window === "undefined") return;
    this.onSync = onSync;
    this.onlineHandler = () => onSync();
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible" && navigator.onLine) onSync();
    };
    window.addEventListener("online", this.onlineHandler);
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.intervalId = setInterval(() => {
      if (navigator.onLine) onSync();
    }, 60_000);
  }

  unregister(): void {
    if (typeof window === "undefined") return;
    if (this.onlineHandler) window.removeEventListener("online", this.onlineHandler);
    if (this.visibilityHandler) document.removeEventListener("visibilitychange", this.visibilityHandler);
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.onSync = null;
  }

  async requestSync(): Promise<void> {
    this.onSync?.();
  }
}

// Picks the best available trigger for this browser. Chromium gets Background Sync; everything
// else gets the event-based fallback. Callers never branch on browser detection themselves.
export function createSyncTrigger(): SyncTrigger {
  const background = new BackgroundSyncAdapter();
  return background.supported ? background : new EventSyncAdapter();
}
