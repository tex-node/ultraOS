"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps an embedded scoreboard current without a websocket or an API key (streak v11, Prompt 4).
//
// The embed page is a server component, so `router.refresh()` re-runs it with fresh database state and React
// patches the DOM in place - no full page reload, no flicker, and no second public endpoint to secure. The
// interval is deliberately coarse: a partner page is usually one of several iframes and does not need sub-second
// latency, and the server does the same tenant-scoped read either way.
export function EmbedRefresher({ intervalSeconds = 15 }: { intervalSeconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [router, intervalSeconds]);
  // A marker element rather than null: it lets a verification check prove the client component mounted, which an
  // empty render would not.
  return <span data-embed-refresher={intervalSeconds} hidden />;
}
