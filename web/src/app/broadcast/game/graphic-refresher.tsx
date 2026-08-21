"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// G.19 Part XXXIX-XLI. Every browser-source graphic polls to pick up new server state -
// deliberately the same router.refresh() polling pattern as the public /live page's
// LiveRefresher (Part XL: "measure actual need" before reaching for WebSockets). This is also
// what makes recovery after a page reload/service restart automatic (Part XLI): each refresh
// re-runs the server component from scratch against current Postgres/SystemSetting state, so
// there is never any client-side state to rebuild.
export function GraphicRefresher({ intervalSeconds = 5 }: { intervalSeconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [router, intervalSeconds]);
  return null;
}
