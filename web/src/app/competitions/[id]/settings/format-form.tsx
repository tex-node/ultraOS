"use client";

import { useActionState } from "react";
import { updateCompetitionFormat, type FormatFormState } from "./actions";

const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white";
const labelClass = "block text-sm text-zinc-300";

export function FormatForm({
  competitionId,
  format,
  groupCount,
}: {
  competitionId: string;
  format: string;
  groupCount: number;
}) {
  const [state, action, pending] = useActionState<FormatFormState, FormData>(updateCompetitionFormat, {});

  return (
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="competitionId" value={competitionId} />
      <label className={labelClass}>
        Format
        <select name="format" defaultValue={format} className={inputClass}>
          <option value="ROUND_ROBIN">League (round-robin) — every team plays every other</option>
          <option value="KNOCKOUT">Knockout — single elimination (extra time &amp; penalties)</option>
          <option value="GROUP_STAGE">Group stage — seeded groups, round-robin within each</option>
          <option value="SWISS">Swiss — paired by record each round, no eliminations</option>
          <option value="DOUBLE_ELIMINATION">Double elimination — two losses to go out</option>
          <option value="LADDER">Ladder — challenge the rung above, climb by winning</option>
        </select>
      </label>
      <label className={labelClass}>
        Groups
        <input
          name="groupCount"
          type="number"
          min={2}
          max={16}
          defaultValue={groupCount}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-zinc-500">Used by the group-stage format only.</span>
      </label>

      {state.error ? (
        <p role="alert" className="sm:col-span-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="sm:col-span-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Saved.
        </p>
      ) : null}

      <button
        disabled={pending}
        className="sm:col-span-2 rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save format"}
      </button>
    </form>
  );
}
