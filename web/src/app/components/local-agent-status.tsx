"use client";

import { useEffect, useState } from "react";

import { detectLocalAgent, looksLikeDesktopShell } from "@/lib/offline/local-agent";

// Mount-time handshake, with a visible consequence (Prompt 5a).
//
// The acceptance run exposed the gap: the agent mirror needs a token, and a token can only be obtained while the server is
// reachable. If the console is opened and the network drops before the first tap, that batch is written to IndexedDB only. Doing
// the handshake when the console mounts means the normal workflow (open online, lose signal, score) always has a token in hand.
//
// The banner exists because "your scoring is going to browser storage instead of the durable queue" is something the scorer must
// be able to see. It only appears inside the desktop shell: a plain browser has no agent by design and must not be told otherwise.
export function LocalAgentStatus() {
  const [state, setState] = useState<"unknown" | "ready" | "unreachable">("unknown");

  useEffect(() => {
    if (!looksLikeDesktopShell()) return;
    let cancelled = false;
    void detectLocalAgent(true).then((present) => {
      if (!cancelled) setState(present ? "ready" : "unreachable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state !== "unreachable") return null;

  return (
    <p
      role="status"
      className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn"
    >
      Local agent unreachable. Scoring will use browser storage. Refresh when online.
    </p>
  );
}
