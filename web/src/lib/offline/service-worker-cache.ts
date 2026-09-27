import type { RuntimeCaching } from "serwist";
import { ExpirationPlugin } from "serwist";
import { NetworkFirst, StaleWhileRevalidate } from "serwist";
import { defaultCache } from "@serwist/turbopack/worker";

// Cache strategies for offline scoring (P13 / A2):
// - Static assets (JS/CSS/fonts/images): stale-while-revalidate so a cached shell loads instantly
//   offline and refreshes in the background when online.
// - API reads (GET /api/*): network-first with a 3s timeout, falling back to the last cached read.
// - Scoring writes: never cached. POST/PUT/PATCH/DELETE are ignored here; all scoring writes go
//   through ScoringRepository -> local store + outbox, and the network is only hit by the A3 sync
//   replay endpoint, which must always reach the server (or fail so the outbox retries).
export const offlineScoringRuntimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ request, url: { pathname } }) =>
      request.method === "GET" && pathname.startsWith("/api/"),
    handler: new NetworkFirst({
      cacheName: "offline-api-reads",
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 128,
          maxAgeSeconds: 60 * 60 * 24,
        }),
      ],
    }),
  },
  {
    matcher: ({ request }) => request.method === "GET" && request.destination !== "",
    handler: new StaleWhileRevalidate({
      cacheName: "offline-static-assets",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 256,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        }),
      ],
    }),
  },
  ...defaultCache,
];
