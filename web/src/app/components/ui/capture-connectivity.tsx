"use client";

import { useEffect, useState } from "react";

// Capture offline indicator (handoff capture surfaces): amber pill when the console loses
// its connection, so the scorer/gate operator knows events may not persist. Honest by
// design — no queued-event count until offline queueing ships (F7), just the state.
export function CaptureConnectivity() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;
  return (
    <p
      role="status"
      className="mb-4 flex items-center justify-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm font-semibold text-warn"
    >
      <span aria-hidden>⚠</span> OFFLINE — events may not reach the server. Reconnect before scoring.
    </p>
  );
}