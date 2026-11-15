"use client";

import { useState, useTransition } from "react";

// A button that actually says what happened.
//
// The upload flow fires the worker once and forgets it, so a failed trigger leaves the video at READY_FOR_ANALYSIS with no way to retry.
// This is the retry, and it reports its own failures inline: silence is what made the missing step look like a missing feature.
export function StartAnalysisButton({
  gameVideoId,
  ingestStatus,
  onStart,
}: {
  gameVideoId: string;
  ingestStatus: string;
  onStart: (gameVideoId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const label = ingestStatus === "ANALYZED" || ingestStatus === "COMPLETED" ? "Re-run analysis" : "Analyse video";

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={pending}
        className="rounded-md bg-accent-purple px-3 py-1.5 text-xs font-semibold text-ink-900 disabled:opacity-50"
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await onStart(gameVideoId);
            if (result.ok) {
              setDone(true);
              setMessage("queued · the worker picks it up within seconds");
            } else {
              setMessage(result.error);
            }
          })
        }
      >
        {pending ? "Starting…" : done ? "Queued" : label}
      </button>
      {message ? <p className="mt-1 text-xs text-text-3">{message}</p> : null}
    </div>
  );
}
