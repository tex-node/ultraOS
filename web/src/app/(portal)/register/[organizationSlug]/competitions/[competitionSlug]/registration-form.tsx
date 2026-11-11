import { SubmitButton } from "@/app/components/submit-button";
import { registerPlayerAction } from "./actions";

// The public registration form (streak v21, Prompt 2).
//
// A PLAIN server-action form, deliberately: no useActionState, no client state, nothing that has to hydrate before it
// works. The first version used useActionState and rendered
//   action="javascript:throw new Error('React form unexpectedly submitted.')"
// until React hydrated - which a fast tap on a slow phone turns into a visible error, and which the browser spec caught
// by submitting before the action existed. Errors now arrive as ?error= on the page (see the page component), and the
// pending state comes from useFormStatus inside SubmitButton, which degrades to a normal submit button.
//
// Validation that matters (age, competition openness, duplicates) still runs on the server where it cannot be skipped.
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
  return (
    <form action={registerPlayerAction} className="rounded-lg border border-line bg-ink-800 p-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="competitionId" value={competitionId} />
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <input type="hidden" name="competitionSlug" value={competitionSlug} />

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

      <SubmitButton className="mt-4 w-full rounded-lg bg-brand-400 px-4 py-2.5 text-sm font-bold text-ink-900 disabled:opacity-50">
        Submit registration
      </SubmitButton>
    </form>
  );
}
