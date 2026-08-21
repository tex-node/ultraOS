"use client";

import { useActionState } from "react";
import { submitOfflineIntake, type OfflineIntakeFormState } from "@/app/participants/offline-intake/actions";
import { ApplicationType, AthleteGender, CoachSeasonZeroDivision, CoachSeasonZeroSelectionStatus } from "@/generated/prisma/enums";

export function OfflineIntakeForm({ seasons }: { seasons: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<OfflineIntakeFormState, FormData>(submitOfflineIntake, {});

  return (
    <form action={action} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
      {state.error ? (
        <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">
          <p>{state.error}</p>
          {state.duplicateMatches && state.duplicateMatches.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-rose-200">
              {state.duplicateMatches.map((match) => (
                <li key={`${match.source}-${match.id}`}>{match.source} {match.id} - {match.name} (matched on {match.matchedOn})</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.createdId ? <p className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-300">Intake record created ({state.createdId}).</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm text-zinc-300">
          Participant type
          <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="participantType" required>
            {Object.values(ApplicationType).map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          Full legal / display name
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="fullName" required />
        </label>
        <label className="block text-sm text-zinc-300">
          Email (leave blank if not yet known — do not invent one)
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="email" type="email" />
        </label>
        <label className="block text-sm text-zinc-300">
          Phone (optional)
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="phone" />
        </label>
        <label className="block text-sm text-zinc-300">
          Season
          <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="seasonId">
            <option value="">Not set</option>
            {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          Season Zero draft division (coaches only)
          <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="coachSeasonZeroDivision">
            <option value="">No division</option>
            {Object.values(CoachSeasonZeroDivision).map((division) => <option key={division} value={division}>{division}</option>)}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          Season Zero selection (coaches only)
          <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="coachSeasonZeroSelectionStatus" defaultValue={CoachSeasonZeroSelectionStatus.PENDING}>
            {Object.values(CoachSeasonZeroSelectionStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          Reason
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="reason" placeholder="Why this person is being onboarded offline" />
        </label>
      </div>
      <label className="mt-3 block text-sm text-zinc-300">
        Notes
        <textarea className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="notes" rows={2} />
      </label>
      <p className="mt-3 text-xs text-zinc-500">
        A photograph is not collected here. Once provisioned, upload a photo from the resulting coach/staff profile
        page, the same way as any other Staff member.
      </p>

      <div className="mt-6 rounded-xl border border-white/[.06] bg-[#050807] p-4">
        <p className="text-xs uppercase tracking-[.15em] text-zinc-500">Player profile (players only)</p>
        <p className="mt-1 text-xs text-zinc-500">
          A real competitive Player record needs all of these — they can be left blank now and added later, but the
          record stays in DRAFT (not eligible for the Secondary Draft) until every field here is filled in.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="block text-sm text-zinc-300">
            Gender
            <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="gender">
              <option value="">Not set</option>
              {Object.values(AthleteGender).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="block text-sm text-zinc-300">
            Date of birth
            <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="dateOfBirth" type="date" />
          </label>
          <label className="block text-sm text-zinc-300">
            Dominant hand
            <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="dominantHand" placeholder="e.g. RIGHT" />
          </label>
          <label className="block text-sm text-zinc-300">
            Position
            <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="position" placeholder="e.g. Guard" />
          </label>
          <label className="block text-sm text-zinc-300">
            Height (cm)
            <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="heightCm" type="number" />
          </label>
          <label className="block text-sm text-zinc-300">
            Weight (kg)
            <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="weightKg" type="number" />
          </label>
        </div>
      </div>
      <button className="mt-5 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60" disabled={pending}>
        {pending ? "Saving..." : "Create intake record"}
      </button>
    </form>
  );
}
