"use client";

import { useActionState } from "react";
import { createTeam, type TeamFormState } from "./actions";

const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white";
const labelClass = "block text-sm text-zinc-300";

export function TeamForm({
  competitionId,
  seasons,
  divisions,
}: {
  competitionId: string;
  seasons: { id: string; name: string }[];
  divisions: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<TeamFormState, FormData>(createTeam, {});

  return (
    <form action={action} className="mt-6 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="competitionId" value={competitionId} />

      <label className={labelClass}>
        Season
        <select name="seasonId" required className={inputClass}>
          <option value="">Select season</option>
          {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Division
        <select name="divisionId" required className={inputClass}>
          <option value="">Select division</option>
          {divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Team name
        <input name="name" required minLength={2} placeholder="e.g. Lagos Warriors" className={inputClass} />
      </label>
      <label className={labelClass}>
        Short name
        <input name="shortName" required maxLength={12} placeholder="e.g. LGW" className={inputClass} />
      </label>
      <label className={labelClass}>
        Primary colour (optional)
        <input name="primaryColor" placeholder="#16f2b3" className={inputClass} />
      </label>
      <label className={labelClass}>
        Secondary colour (optional)
        <input name="secondaryColor" placeholder="#0b100e" className={inputClass} />
      </label>

      {state.error ? (
        <p role="alert" className="sm:col-span-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="sm:col-span-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {state.name} is registered. Manage the roster from the team&apos;s season page.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="sm:col-span-2 rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add team"}
      </button>
    </form>
  );
}
