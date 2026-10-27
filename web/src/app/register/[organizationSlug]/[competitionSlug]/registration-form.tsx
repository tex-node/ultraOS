"use client";

import { useActionState } from "react";
import { registerPlayerAction, type RegistrationResult } from "./actions";

// The public registration form (streak v19, Prompt 2).
//
// Deliberately a plain form with a server action: no client-side router state to lose, and every validation that matters
// (age, competition openness, duplicate application) runs on the server where it cannot be skipped.
export function RegistrationForm({
  organizationId,
  competitionId,
  seasonId,
  organizationSlug,
  competitionSlug,
  competitionName,
}: {
  organizationId: string;
  competitionId: string;
  seasonId: string;
  organizationSlug: string;
  competitionSlug: string;
  competitionName: string;
}) {
  const [result, action, pending] = useActionState<RegistrationResult | null, FormData>(
    (previous, formData) => registerPlayerAction(organizationSlug, competitionSlug, previous, formData),
    null,
  );

  return (
    <form action={action} className="rounded-lg border border-line bg-ink-800 p-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="competitionId" value={competitionId} />
      <input type="hidden" name="seasonId" value={seasonId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-text-3">
          First name
          <input name="firstName" required maxLength={80} className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1" />
        </label>
        <label className="text-xs text-text-3">
          Last name
          <input name="lastName" required maxLength={80} className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1" />
        </label>
        <label className="text-xs text-text-3 sm:col-span-2">
          Email
          <input name="email" type="email" required maxLength={200} className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1" />
        </label>
        <label className="text-xs text-text-3">
          Date of birth
          <input name="dateOfBirth" type="date" required className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1" />
        </label>
        <label className="text-xs text-text-3">
          Position (optional)
          <input name="position" maxLength={60} placeholder="e.g. Guard" className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1" />
        </label>
        <label className="text-xs text-text-3">
          Gender
          <select name="gender" required className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1">
            <option value="">Select…</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
          </select>
        </label>
        <label className="text-xs text-text-3">
          Preferred hand
          <select name="dominantHand" defaultValue="RIGHT" className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1">
            <option value="RIGHT">Right</option>
            <option value="LEFT">Left</option>
          </select>
        </label>
        <label className="text-xs text-text-3">
          Guardian name (under 18)
          <input name="guardianName" maxLength={120} className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1" />
        </label>
        <label className="text-xs text-text-3">
          Guardian phone (under 18)
          <input name="guardianPhone" maxLength={40} className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1" />
        </label>
      </div>

      <p className="mt-4 text-[11px] text-text-3">
        Submitting this form creates an application for <b className="text-text-2">{competitionName}</b>. A league
        administrator reviews it before you are registered - it is not automatic.
      </p>

      {result && !result.ok ? (
        <p className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{result.error}</p>
      ) : null}

      <button type="submit" disabled={pending} className="mt-4 w-full rounded-lg bg-brand-400 px-4 py-2.5 text-sm font-bold text-ink-900 disabled:opacity-50">
        {pending ? "Submitting…" : "Submit registration"}
      </button>
    </form>
  );
}
