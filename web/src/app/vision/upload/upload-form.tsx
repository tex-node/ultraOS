"use client";

import { useState } from "react";

// The upload form reports REAL stages, not a spinner that means nothing: the fetch is one request, so the
// honest states are "sending" (bytes on the wire) and then whatever the server said. A fake "analysis running"
// progress bar would be a lie - the analysis happens in the worker, minutes later, and the page links to the
// video workspace where its status is visible.

type State =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string }
  | { kind: "done"; gameVideoId: string; queued: boolean; runId: string | null; warning: string | null; duplicate: boolean }
  | { kind: "error"; message: string };

export function VisionUploadForm({ fixtures }: { fixtures: { id: string; label: string }[] }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [fixtureId, setFixtureId] = useState(fixtures[0]?.id ?? "");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setState({ kind: "error", message: "Choose a video file first." });
      return;
    }
    setState({ kind: "uploading", fileName: file.name });
    try {
      const response = await fetch("/api/vision/upload", { method: "POST", body: data });
      const payload = (await response.json()) as {
        error?: string;
        gameVideoId?: string;
        duplicate?: boolean;
        analysis?: { queued?: boolean; runId?: string | null; warning?: string | null };
      };
      if (!response.ok || !payload.gameVideoId) {
        setState({ kind: "error", message: payload.error ?? `Upload failed (HTTP ${response.status}).` });
        return;
      }
      setState({
        kind: "done",
        gameVideoId: payload.gameVideoId,
        duplicate: payload.duplicate === true,
        queued: payload.analysis?.queued === true,
        runId: payload.analysis?.runId ?? null,
        warning: payload.analysis?.warning ?? null,
      });
      form.reset();
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-line bg-ink-800 p-4">
        <label className="block text-xs text-text-2">
          Fixture
          <select
            name="fixtureId"
            value={fixtureId}
            onChange={(event) => setFixtureId(event.target.value)}
            required
            className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm"
          >
            {fixtures.length === 0 ? <option value="">No fixtures yet</option> : null}
            {fixtures.map((fixture) => (
              <option key={fixture.id} value={fixture.id}>
                {fixture.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-text-2">
          Video file (.mp4 / .mov)
          <input name="file" type="file" accept="video/mp4,video/quicktime,.mp4,.mov" required className="mt-1 block w-full text-sm text-text-1" />
        </label>
        <label className="block text-xs text-text-2">
          Camera label
          <input name="cameraLabel" defaultValue="Camera 1" maxLength={80} className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm" />
        </label>
        <button
          type="submit"
          disabled={state.kind === "uploading" || fixtures.length === 0}
          className="min-h-[44px] rounded-md bg-brand-400 px-4 text-sm font-bold text-ink-900 disabled:opacity-40"
        >
          {state.kind === "uploading" ? "Uploading…" : "Upload video"}
        </button>
        <p className="text-[11px] text-text-3">
          The file is probed, stored, and registered as a GameVideo. If the vision worker is reachable the analysis is queued
          immediately; otherwise the beat poller picks it up within 5 minutes.
        </p>
      </form>

      {state.kind === "uploading" ? (
        <p role="status" className="rounded-md bg-info/10 p-3 text-sm text-info">
          Uploading <span className="font-semibold">{state.fileName}</span> — sending to the server…
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p role="alert" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      {state.kind === "done" ? (
        <div role="status" className="rounded-md bg-brand-400/10 p-3 text-sm text-brand-300">
          <p className="font-semibold">
            {state.duplicate ? "Already registered — no new video was created." : "Video registered."}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-text-2">
            <li>GameVideo: {state.gameVideoId}</li>
            <li>
              Analysis:{" "}
              {state.queued
                ? `queued${state.runId ? ` (run ${state.runId})` : ""}`
                : `not queued yet — ${state.warning ?? "the poller will collect it"}`}
            </li>
          </ul>
          <a href={`/vision/videos`} className="mt-2 inline-block text-xs text-info underline">
            Open the video workspace
          </a>
        </div>
      ) : null}
    </div>
  );
}
