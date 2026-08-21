"use client";

import { useActionState } from "react";
import { addAllStarMemberAction, type AllStarRosterFormState } from "@/app/participants/all-star-roster/actions";
import { ALL_STAR_TEAM_SLUGS } from "@/lib/all-star-teams-constants";
import type { AllStarCandidate } from "@/lib/all-star-teams";

const teamLabels: Record<string, string> = { zenith: "Zenith", pulse: "Pulse" };

function optionLabel(candidate: AllStarCandidate) {
  return `${candidate.fullName}${candidate.clubName ? ` (${candidate.clubName})` : ""}${candidate.position ? ` — ${candidate.position}` : ""}`;
}

export function AddAllStarMemberForm({
  playersMale,
  playersFemale,
  coachesMale,
  coachesFemale,
}: {
  playersMale: AllStarCandidate[];
  playersFemale: AllStarCandidate[];
  coachesMale: AllStarCandidate[];
  coachesFemale: AllStarCandidate[];
}) {
  const [state, action, pending] = useActionState<AllStarRosterFormState, FormData>(addAllStarMemberAction, {});
  const hasCandidates = playersMale.length + playersFemale.length + coachesMale.length + coachesFemale.length > 0;

  return (
    <form action={action} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
      {state.error ? (
        <p className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">{state.error}</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
        <label className="block text-sm text-zinc-300">
          Team
          <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="teamSlug" required>
            {ALL_STAR_TEAM_SLUGS.map((slug) => <option key={slug} value={slug}>{teamLabels[slug] ?? slug}</option>)}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          Player or coach
          <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="selection" required disabled={!hasCandidates}>
            <option value="">{hasCandidates ? "Select from the current roster pool" : "No eligible players or coaches remaining"}</option>
            {playersMale.length ? (
              <optgroup label="Players — Male">
                {playersMale.map((c) => <option key={c.sourceId} value={`PLAYER:${c.sourceId}`}>{optionLabel(c)}</option>)}
              </optgroup>
            ) : null}
            {playersFemale.length ? (
              <optgroup label="Players — Female">
                {playersFemale.map((c) => <option key={c.sourceId} value={`PLAYER:${c.sourceId}`}>{optionLabel(c)}</option>)}
              </optgroup>
            ) : null}
            {coachesMale.length ? (
              <optgroup label="Coaches — Male">
                {coachesMale.map((c) => <option key={c.sourceId} value={`COACH:${c.sourceId}`}>{optionLabel(c)}</option>)}
              </optgroup>
            ) : null}
            {coachesFemale.length ? (
              <optgroup label="Coaches — Female">
                {coachesFemale.map((c) => <option key={c.sourceId} value={`COACH:${c.sourceId}`}>{optionLabel(c)}</option>)}
              </optgroup>
            ) : null}
          </select>
        </label>
        <button className="mt-2 self-end rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60" disabled={pending || !hasCandidates}>
          {pending ? "Adding..." : "Add to roster"}
        </button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Only currently-rostered players and currently-assigned coaches appear here. Each team takes 2 male + 2 female players and 2 male + 2 female coaches.
      </p>
    </form>
  );
}
