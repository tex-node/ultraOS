"use client";

import { useEffect, useState } from "react";

// Registers the Serwist service worker. PRODUCTION ONLY: in `next dev`, caching HMR responses
// produces stale-chunk bugs that look like application errors, so registration is gated behind
// NODE_ENV === "production". Playwright offline tests therefore run against a production build.
const SW_URL = "/serwist/sw.js";

export function ServiceWorkerRegistrar() {
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then(() => setRegistered(true))
      .catch(() => setRegistered(false));
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    // If the outbox drains nothing while offline, this keeps the (single) client updated once a
    // new worker takes over after a deploy without a hard refresh.
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onControllerChange = () => {
      if (!registered) return;
      // No reload here: a reload mid-score would be hostile. Serwist's skipWaiting + clientsClaim
      // handle the takeover; this is a no-op hook for future cache-invalidation messaging.
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, [registered]);

  return null;
}
