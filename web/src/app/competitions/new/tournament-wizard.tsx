"use client";

import { useActionState, useState } from "react";
import type { SportSummary } from "@/lib/sports/registry";
import { createTournament, type TournamentFormState } from "../actions";

const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white";
const labelClass = "block text-sm text-zinc-300";

const CAPABILITY_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SHOT_CLOCK: "Shot clock",
  ULTRA_TIME: "Ultra Time",
  FOUR_POINT: "Four-point",
  SUBSTITUTIONS: "Substitutions",
  INNINGS: "Innings",
  ROTATION: "Rotation",
  SURFACE_VISION: "Court vision",
  EXTRA_TIME: "Extra time",
  PENALTIES: "Penalties",
};

export function TournamentWizard({ summaries }: { summaries: SportSummary[] }) {
  const [state, action, pending] = useActionState<TournamentFormState, FormData>(createTournament, {});
  const [sportKey, setSportKey] = useState(summaries[0]?.key ?? "");
  const [divisions, setDivisions] = useState((summaries[0]?.defaultDivisions ?? ["Open"]).join(", "));

  const selected = summaries.find((summary) => summary.key === sportKey) ?? summaries[0];

  function chooseSport(key: string) {
    setSportKey(key);
    const chosen = summaries.find((summary) => summary.key === key);
    if (chosen && chosen.defaultDivisions.length > 0) {
      setDivisions(chosen.defaultDivisions.join(", "));
    }
  }

  return (
    <form action={action} className="mt-6 grid gap-6">
      <input type="hidden" name="sportSlug" value={selected?.slug ?? ""} />

      <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Step 1 · Sport</p>
        <h2 className="mt-2 text-lg font-semibold">Which sport is this tournament for?</h2>
        <p className="mt-1 text-sm text-zinc-400">Choosing a sport sets the format, scoring, and which tools appear.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => {
            const active = summary.key === selected?.key;
            return (
              <button
                key={summary.key}
                type="button"
                onClick={() => chooseSport(summary.key)}
                aria-pressed={active}
                className={`rounded-xl border p-4 text-left transition ${
                  active ? "border-emerald-400 bg-emerald-400/10" : "border-white/10 bg-white/[.02] hover:border-white/25"
                }`}
              >
                <span className="block font-semibold">{summary.name}</span>
                <span className="mt-1 block text-xs text-zinc-400">{summary.entityLabel}</span>
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[.02] p-4">
            <p className="text-sm text-zinc-200">{selected.formatSummary}</p>
            {selected.capabilities.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.capabilities.map((capability) => (
                  <span key={capability} className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-zinc-300">
                    {CAPABILITY_LABELS[capability] ?? capability}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Step 2 · Details</p>
        <h2 className="mt-2 text-lg font-semibold">Name the tournament and its first season</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Tournament name
            <input name="competitionName" required minLength={3} placeholder="e.g. Ultra Basketball" className={inputClass} />
          </label>
          <label className={labelClass}>
            Season name
            <input name="seasonName" required minLength={2} placeholder="e.g. 2026 Season" className={inputClass} />
          </label>
          <label className={labelClass}>
            Season start
            <input name="startDate" type="date" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Season end
            <input name="endDate" type="date" required className={inputClass} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Step 3 · Divisions</p>
        <h2 className="mt-2 text-lg font-semibold">Who competes?</h2>
        <label className={labelClass}>
          Divisions (comma-separated)
          <input
            name="divisions"
            required
            value={divisions}
            onChange={(event) => setDivisions(event.target.value)}
            placeholder="Men's, Women's"
            className={inputClass}
          />
        </label>
        <p className="mt-2 text-xs text-zinc-500">Edit the suggestion to match your competition. You can add more later.</p>
      </section>

      {state.error ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !selected}
          className="rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create tournament"}
        </button>
        <span className="text-xs text-zinc-500">Creates the competition, first season, and divisions.</span>
      </div>
    </form>
  );
}
