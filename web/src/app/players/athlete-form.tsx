"use client";

import { useActionState } from "react";
import type { AthleteGender } from "@/generated/prisma/enums";
import type { PlayerFormState } from "@/lib/player-validation";

type Action = (state: PlayerFormState, formData: FormData) => Promise<PlayerFormState>;
type AthleteValue = {
  firstName: string; lastName: string; gender: AthleteGender; dateOfBirth: Date;
  dominantHand: string; phone: string | null; email: string | null;
  emergencyContact: string | null; previousTeam: string | null;
  photoUrl: string | null; nationality: string | null;
  passportPublished: boolean;
};
const field = "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400";

export function AthleteForm({ action, athlete, label }: { action: Action; athlete?: AthleteValue; label: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const inputs = [
    ["firstName", "First name", "text"], ["lastName", "Last name", "text"],
    ["dateOfBirth", "Date of birth", "date"], ["dominantHand", "Dominant hand", "text"],
    ["phone", "Phone", "tel"], ["email", "Email", "email"],
    ["emergencyContact", "Emergency contact", "text"], ["previousTeam", "Previous team", "text"],
    ["nationality", "Nationality", "text"], ["photoUrl", "Photo URL", "url"],
  ] as const;
  const values: Record<string, string> = athlete ? {
    firstName: athlete.firstName, lastName: athlete.lastName,
    dateOfBirth: athlete.dateOfBirth.toISOString().slice(0, 10),
    dominantHand: athlete.dominantHand, phone: athlete.phone ?? "", email: athlete.email ?? "",
    emergencyContact: athlete.emergencyContact ?? "", previousTeam: athlete.previousTeam ?? "",
    nationality: athlete.nationality ?? "", photoUrl: athlete.photoUrl ?? "",
  } : {};

  return <form action={formAction} className="space-y-6">
    {state.error ? <p className="rounded-xl bg-rose-400/10 p-3 text-sm text-rose-300">{state.error}</p> : null}
    <div className="grid gap-5 md:grid-cols-2">
      {inputs.map(([name, text, type]) => <label key={name} className="text-sm text-zinc-300">{text}
        <input className={field} name={name} type={type} defaultValue={values[name]} required={["firstName","lastName","dateOfBirth","dominantHand"].includes(name)} />
        {state.fieldErrors?.[name]?.[0] ? <span className="text-xs text-rose-400">{state.fieldErrors[name]?.[0]}</span> : null}
      </label>)}
      <label className="text-sm text-zinc-300">Gender<select className={field} name="gender" defaultValue={athlete?.gender ?? "MALE"}><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
    </div>
    {/* Streak v4, Prompt 3: explicit publication. Unchecked means the public passport route 404s for
        everyone who is not a coach or an operator; coaches keep seeing it. */}
    <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
      <input type="checkbox" name="passportPublished" value="true" defaultChecked={athlete?.passportPublished ?? true} className="mt-0.5 h-4 w-4" />
      <span>
        Publish passport to public
        <span className="mt-1 block text-xs text-zinc-500">
          When unchecked, the athlete&apos;s passport page is not available to the public. Coaches and league operators still see it.
        </span>
      </span>
    </label>
    <button className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60" disabled={pending}>{pending ? "Saving..." : label}</button>
  </form>;
}
