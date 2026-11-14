"use client";

import { useCallback, useEffect, useState } from "react";

import { drainVisionObservations } from "@/lib/offline/outbox";
import {
  analyzeVideo,
  downloadVisionEngine,
  looksLikeDesktopShell,
  pickVideo,
  saveVisionObservations,
  startVisionSidecar,
  visionStatus,
  type VisionEngineStatus,
} from "@/lib/offline/local-agent";

// Local vision engine panel (Prompt 5c-iv/v).
//
// The page orchestrates; it never touches the file. `PICK_VIDEO` opens the native dialog in the agent and returns a path; `ANALYZE_VIDEO`
// runs the sidecar on that path; observations come back as JSON and are queued in the agent's SQLite. Streaming a multi-gigabyte video
// through a webview would defeat the purpose of a desktop app.
//
// Everything is driven by the agent's own status, never by optimistic UI state.

type Phase = "unknown" | "browser" | "checking" | "install" | "download" | "start" | "running";
type Job =
  | { kind: "idle" }
  | { kind: "analyzing"; fileName: string }
  | { kind: "done"; saved: number; synced: number; fixtureId: string }
  | { kind: "error"; message: string };

export function LocalVisionPanel({ fixtures }: { fixtures: { id: string; label: string }[] }) {
  const [phase, setPhase] = useState<Phase>("unknown");
  const [status, setStatus] = useState<VisionEngineStatus | null>(null);
  const [toastSeen, setToastSeen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixtureId, setFixtureId] = useState(fixtures[0]?.id ?? "");
  const [job, setJob] = useState<Job>({ kind: "idle" });

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

  useEffect(() => {
    if (phase !== "download") return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [phase, refresh]);

  const runPick = useCallback(async () => {
    setError(null);
    if (!fixtureId) {
      setError("choose the fixture this video belongs to first");
      return;
    }

    const picked = await pickVideo();
    if (picked.cancelled) return;

    if (picked.fileSizeBytes > 2 * 1024 * 1024 * 1024) {
      const proceed = window.confirm(
        `This is a large video (${(picked.fileSizeBytes / 1073741824).toFixed(1)} GB). Processing may take 30+ minutes. Continue?`,
      );
      if (!proceed) return;
    }

    let registration: { gameVideoId: string; analysisRunId: string };
    try {
      const response = await fetch("/api/vision/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fixtureId, fileName: picked.fileName, fileSize: picked.fileSizeBytes }),
      });
      if (!response.ok) throw new Error(`register failed (${response.status})`);
      registration = (await response.json()) as { gameVideoId: string; analysisRunId: string };
    } catch {
      // Registration is the one step that needs the server: the observations need a GameVideo and a run to attach to.
      setJob({ kind: "error", message: "Video registration requires internet. Try again when connected." });
      return;
    }

    setJob({ kind: "analyzing", fileName: picked.fileName });
    const analyzed = await analyzeVideo({
      videoPath: picked.videoPath,
      gameVideoId: registration.gameVideoId,
      analysisRunId: registration.analysisRunId,
    });

    if (!analyzed) {
      setJob({ kind: "error", message: "the local agent is not reachable" });
      return;
    }
    if (analyzed.error) {
      setJob({ kind: "error", message: analyzed.error });
      return;
    }

    const saved = await saveVisionObservations({
      gameVideoId: registration.gameVideoId,
      analysisRunId: registration.analysisRunId,
      observations: analyzed.observations,
    });
    const drained = await drainVisionObservations();

    setJob({
      kind: "done",
      saved: saved?.pending ?? analyzed.observations.length,
      synced: drained.accepted + drained.duplicates,
      fixtureId,
    });
  }, [fixtureId]);

  if (phase === "browser" || phase === "unknown" || phase === "checking") return null;

  const percent =
    status && status.totalBytes > 0 ? Math.min(100, Math.round((status.downloadedBytes / status.totalBytes) * 100)) : 0;

  return (
    <section className="rounded-lg border border-line bg-ink-800 p-5">
      {phase === "install" ? (
        <>
          <h2 className="font-semibold">Process video locally</h2>
          <p className="mt-2 text-sm text-text-2">
            Install the UltraOS Vision Engine (~250 MB). Takes 10-15 minutes on venue wifi. Videos are processed on this device and only
            the results are synced.
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

          <label className="mt-3 block text-xs text-text-3" htmlFor="vision-fixture">
            Fixture
          </label>
          <select
            id="vision-fixture"
            className="mt-1 w-full rounded-lg bg-white/[.05] p-2 text-sm"
            value={fixtureId}
            onChange={(event) => setFixtureId(event.target.value)}
          >
            {fixtures.map((fixture) => (
              <option key={fixture.id} value={fixture.id}>
                {fixture.label}
              </option>
            ))}
          </select>

          <p className="mt-3 text-xs text-text-3">
            Estimated processing time depends on your device. On a laptop without a dedicated GPU, expect several hours for a full game.
            Consider running this overnight.
          </p>

          <button
            type="button"
            className="mt-3 rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900 disabled:opacity-50"
            disabled={job.kind === "analyzing"}
            onClick={() => void runPick()}
          >
            {job.kind === "analyzing" ? "Processing…" : job.kind === "done" ? "Pick Another Video" : "Pick Video"}
          </button>
        </>
      ) : null}

      {job.kind === "analyzing" ? (
        <p role="status" className="mt-3 text-sm text-text-2">
          Processing {job.fileName}… this may take several minutes. Cancel is not available yet.
        </p>
      ) : null}

      {job.kind === "done" ? (
        <p role="status" className="mt-3 text-sm text-text-1">
          {job.saved} observation{job.saved === 1 ? "" : "s"} queued · {job.synced} synced to the server.{" "}
          <a className="text-info underline" href={`/vision/games/${job.fixtureId}`}>
            Review them
          </a>
          .
        </p>
      ) : null}

      {job.kind === "error" ? <p className="mt-3 text-sm text-warn">{job.message}</p> : null}

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
