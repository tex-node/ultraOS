"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Part XXXII: "Do not introduce WebSockets merely because this is live... measure actual
// need." A spectator page refreshing every few seconds via the existing server-authoritative
// render (force-dynamic, revalidate 0) is more than adequate latency for a basketball
// scoreboard, with zero new infrastructure - router.refresh() re-runs the server component,
// which re-fetches Snapshot V2 fresh from Postgres every time.
export function LiveRefresher({ intervalSeconds = 8 }: { intervalSeconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [router, intervalSeconds]);
  return null;
}
