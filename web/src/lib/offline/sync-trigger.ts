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

  get supported(): boolean {
    if (typeof navigator === "undefined") return false;
    return "serviceWorker" in navigator && "SyncManager" in globalThis;
  }

  register(): void {
    // No listener needed: the background sync event is handled in the service worker.
  }

  unregister(): void {}

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
