"use client";

import { useState } from "react";

import { looksLikeDesktopShell } from "@/lib/offline/local-agent";

// The cloud upload path is now a test harness, not a workflow (v37 Prompt 1).
//
// The VPS worker does 0.016 fps on this host — a 10-second clip is about an hour, a full game is measured in days. Leaving the upload
// form as the default told users otherwise. In a browser the form is collapsed behind an explicit "test harness" link with the cost
// stated up front; in the desktop app the local picker above is the path that matters.

export function CloudHarness({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const inDesktop = looksLikeDesktopShell();

  if (inDesktop) {
    // The desktop app has the local picker; a cloud upload here would be a slower, more expensive route to the same place.
    return null;
  }

  return (
    <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5">
      <h2 className="font-semibold">Processing a 10-second test clip?</h2>
      <p className="mt-1 text-xs text-text-3">
        The cloud test harness exists to prove the pipeline, not to process games. It runs on shared CPU hardware.
      </p>
      {open ? (
        <div className="mt-3">
          <p role="status" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            This will take roughly one hour per 10-second clip on shared hardware. Do not close this tab.
          </p>
          <div className="mt-4">{children}</div>
        </div>
      ) : (
        <button
          type="button"
          className="mt-3 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-text-2 transition hover:border-brand-400/50"
          onClick={() => setOpen(true)}
        >
          Use the cloud test harness
        </button>
      )}
    </section>
  );
}
