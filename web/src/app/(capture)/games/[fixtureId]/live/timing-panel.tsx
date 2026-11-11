"use client";

import { useEffect, useRef, useState } from "react";
import { recordFinishTime } from "@/app/games/actions";

// The flag-race timing console (streak v12, Prompt 1b).
//
// A race has no score to press, so the operator needs a stopwatch and a way to attach the measured time to a
// competitor. The clock runs in the browser (a server clock would drift against the operator's own start), is
// stopped with a button, and the measured seconds are then confirmed against a competitor select - the operator can
// correct the number before saving, because a mistimed press must not become a false record.
//
// The value is submitted to recordFinishTime, which stores it as a FINISH_TIME event with data.seconds. Nothing here
// touches the score: a race is not 1-0.
export function TimingPanel({
  gameId,
  fixtureId,
  competitors,
  recent,
}: {
  gameId: string;
  fixtureId: string;
  competitors: { id: string; name: string }[];
  recent: { name: string; seconds: number; formatted: string }[];
}) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stopped, setStopped] = useState<number | null>(null);
  const [competitorId, setCompetitorId] = useState(competitors[0]?.id ?? "");
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (startedAt.current !== null) setElapsed((performance.now() - startedAt.current) / 1000);
    }, 50);
    return () => clearInterval(timer);
  }, [running]);

  function start() {
    startedAt.current = performance.now();
    setElapsed(0);
    setStopped(null);
    setRunning(true);
  }

  function stop() {
    if (startedAt.current === null) return;
    const seconds = Math.round(((performance.now() - startedAt.current) / 1000) * 100) / 100;
    setRunning(false);
    setElapsed(seconds);
    setStopped(seconds);
  }

  const shown = stopped ?? elapsed;

  return (
    <section className="mt-6 rounded-lg border border-line bg-ink-800 p-4">
      <h2 className="text-sm font-bold uppercase tracking-[.15em] text-brand-300">Timing</h2>
      <p className="mt-1 text-xs text-text-3">
        Start the clock on the gun, stop it on the line, then confirm which competitor ran that time.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <p className="font-mono text-4xl font-black tabular-nums">{shown.toFixed(2)}s</p>
        <button
          type="button"
          onClick={running ? stop : start}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${running ? "border border-danger/40 text-danger" : "border border-brand-400/40 text-brand-300"}`}
        >
          {running ? "Stop" : stopped === null ? "Start" : "Restart"}
        </button>
        {stopped !== null ? (
          <button type="button" onClick={() => { setStopped(null); setElapsed(0); }} className="text-xs text-text-3 underline">
            Clear
          </button>
        ) : null}
      </div>

      {stopped !== null ? (
        <form action={recordFinishTime.bind(null, gameId, fixtureId)} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-text-3">
            Competitor
            <select
              name="competitorId"
              value={competitorId}
              onChange={(event) => setCompetitorId(event.target.value)}
              className="ml-2 rounded border border-line bg-ink-900 px-2 py-1.5 text-sm text-text-1"
            >
              {competitors.map((competitor) => (
                <option key={competitor.id} value={competitor.id}>{competitor.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-3">
            Seconds
            <input
              name="seconds"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={stopped.toFixed(2)}
              className="ml-2 w-24 rounded border border-line bg-ink-900 px-2 py-1.5 font-mono text-sm text-text-1"
            />
          </label>
          <button type="submit" className="rounded-lg border border-brand-400/40 px-4 py-2 text-sm font-bold text-brand-300">
            Save time
          </button>
        </form>
      ) : null}

      {recent.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wide text-text-3">Recorded times</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {recent.map((entry, index) => (
              <li key={`${entry.name}-${index}`} className="flex justify-between gap-4">
                <span className="text-text-1">{entry.name}</span>
                <span className="font-mono text-text-2">{entry.formatted}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
