/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { offlineScoringRuntimeCaching } from "@/lib/offline/service-worker-cache";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: offlineScoringRuntimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// Background Sync receiver. A2 registers the `scoring-sync` tag; A3 fills in the actual outbox
// drain against POST /api/sync/outbox. Handling the event here (rather than leaving it
// unhandled) means the browser's wake-up is never a silent no-op, and the tag name lives in one
// place — kept in sync with SCORING_SYNC_TAG in src/lib/offline/sync-trigger.ts.
self.addEventListener("sync", (event) => {
  const syncEvent = event as ExtendableEvent & { tag?: string };
  if (syncEvent.tag !== "scoring-sync") return;
  syncEvent.waitUntil(
    (async () => {
      // A3: drain the outbox and POST the batch to /api/sync/outbox here.
      // Intentionally a no-op until the sync endpoint exists; the outbox retains every record.
    })(),
  );
});
