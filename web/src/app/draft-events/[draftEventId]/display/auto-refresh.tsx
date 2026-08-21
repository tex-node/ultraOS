"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The projector display has no operator interaction, so it must pull fresh
// state on its own rather than waiting for a manual reload. router.refresh()
// re-runs the server component fetch in place (no flash/reload), matching
// how the operator's control-room actions already revalidate this route.
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
