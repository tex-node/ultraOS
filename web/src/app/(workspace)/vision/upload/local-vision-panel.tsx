"use client";

import { useCallback, useEffect, useState } from "react";

import {
  downloadVisionEngine,
  looksLikeDesktopShell,
  startVisionSidecar,
  visionStatus,
  type VisionEngineStatus,
} from "@/lib/offline/local-agent";

// The local vision engine panel (Prompt 5c-iv).
//
// Three states, one card each, and the SmartScreen toast exactly once. Everything here is driven by the agent's own status rather than
// by optimistic UI state: if the engine is not installed, the page says so because the agent said so.
//
// STATE C IS DELIBERATELY INCOMPLETE. A browser cannot hand a local file path to a process - `input[type=file]` gives a Blob, not a
// path - so "upload and process" needs the agent to open a native file dialog and stream the file itself. That bridge is not built,
// and a fake upload button that silently did nothing would be worse than no button. The card states what is true and what is missing.

type Phase = "unknown" | "browser" | "checking" | "install" | "download" | "start" | "running";

export function LocalVisionPanel() {
  const [phase, setPhase] = useState<Phase>("unknown");
  const [status, setStatus] = useState<VisionEngineStatus | null>(null);
  const [toastSeen, setToastSeen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await visionStatus();
    setStatus(next);
    if (!next) return setPhase("browser");
    setPhase(next.downloading ? "download" : next.running ? "running" : next.installed ? "start" : "install");
  }, []);

  useEffect(() => {
    if (!looksLikeDesktopShell()) {
      setPhase("browser");
      return;
    }
    setPhase("checking");
    void refresh();
  }, [refresh]);

  // Poll while downloading so the progress bar moves without the page having to invent a rate.
  useEffect(() => {
    if (phase !== "download") return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [phase, refresh]);

  if (phase === "browser" || phase === "unknown" || phase === "checking") return null;

  const percent =
    status && status.totalBytes > 0 ? Math.min(100, Math.round((status.downloadedBytes / status.totalBytes) * 100)) : 0;

  return (
    <section className="rounded-lg border border-line bg-ink-800 p-5">
      {phase === "install" ? (
        <>
          <h2 className="font-semibold">Process video locally</h2>
          <p className="mt-2 text-sm text-text-2">
            Install the UltraOS Vision Engine (~250 MB). Takes 10-15 minutes on venue wifi. Videos are processed on this device and
            only the results are synced.
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900"
            onClick={async () => {
              setError(null);
              setPhase("download");
              const started = await downloadVisionEngine();
              if (!started) {
                setError("could not start the download");
                setPhase("install");
                return;
              }
              setToastSeen(true);
            }}
          >
            Install Vision Engine
          </button>
        </>
      ) : null}

      {phase === "download" ? (
        <>
          <h2 className="font-semibold">Downloading the Vision Engine</h2>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-text-3">
            {percent}% · {status ? (status.downloadedBytes / 1048576).toFixed(1) : "0.0"} /{" "}
            {status ? (status.totalBytes / 1048576).toFixed(1) : "249.1"} MB
          </p>
          <p className="mt-1 text-xs text-text-3">Keep this window open. You can use the app normally while it downloads.</p>
        </>
      ) : null}

      {phase === "start" ? (
        <>
          <h2 className="font-semibold">Vision Engine installed</h2>
          <p className="mt-2 text-sm text-text-2">The engine is on this device. Start it to process videos locally.</p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900"
            onClick={async () => {
              setError(null);
              const started = await startVisionSidecar();
              if (!started) setError("the engine did not answer its health check; try again");
              await refresh();
            }}
          >
            Start Vision Engine
          </button>
        </>
      ) : null}

      {phase === "running" ? (
        <>
          <h2 className="font-semibold">Vision Engine running locally</h2>
          <p className="mt-2 text-sm text-text-2">
            Processing happens on this device. Observations queue locally and sync with the same signed token as scoring.
          </p>
          <p className="mt-3 rounded-lg border border-line bg-ink-700 p-3 text-xs text-text-3">
            Video selection needs the native file picker, which the agent does not expose yet. Until it does, uploads go through the
            existing server-side flow below.
          </p>
        </>
      ) : null}

      {toastSeen ? (
        <p role="status" className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          Windows will show a security warning on first run. Click &quot;More info&quot; → &quot;Run anyway&quot;. This is because the
          app is unsigned; the download is verified by SHA256.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-xs text-warn">{error}</p> : null}
    </section>
  );
}
