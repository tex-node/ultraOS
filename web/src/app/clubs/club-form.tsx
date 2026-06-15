"use client";

import { useActionState } from "react";
import type { ClubStatus } from "@/generated/prisma/enums";
import type { ClubFormState } from "@/lib/club-validation";

type ClubAction = (
  state: ClubFormState,
  formData: FormData,
) => Promise<ClubFormState>;

type ClubFormProps = {
  action: ClubAction;
  sports: Array<{ id: string; name: string }>;
  club?: {
    sportId: string;
    name: string;
    shortName: string;
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    foundedYear: number | null;
    status: ClubStatus;
    websiteUrl: string | null;
  };
  submitLabel: string;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400";

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <p className="mt-1 text-xs text-rose-400">{errors[0]}</p> : null;
}

export function ClubForm({ action, sports, club, submitLabel }: ClubFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">
          {state.error}
        </p>
      ) : null}
      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-sm font-medium text-zinc-300">
          Sport
          <select className={inputClass} name="sportId" defaultValue={club?.sportId} required>
            <option value="">Select sport</option>
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.name}
              </option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors?.sportId} />
        </label>
        <label className="text-sm font-medium text-zinc-300">
          Status
          <select className={inputClass} name="status" defaultValue={club?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label className="text-sm font-medium text-zinc-300">
          Club name
          <input className={inputClass} name="name" defaultValue={club?.name} required />
          <FieldError errors={state.fieldErrors?.name} />
        </label>
        <label className="text-sm font-medium text-zinc-300">
          Short name
          <input
            className={inputClass}
            name="shortName"
            defaultValue={club?.shortName}
            maxLength={8}
            required
          />
          <FieldError errors={state.fieldErrors?.shortName} />
        </label>
        <label className="text-sm font-medium text-zinc-300">
          Primary color
          <input
            className={inputClass}
            name="primaryColor"
            type="color"
            defaultValue={club?.primaryColor ?? "#16F2B3"}
            required
          />
          <FieldError errors={state.fieldErrors?.primaryColor} />
        </label>
        <label className="text-sm font-medium text-zinc-300">
          Secondary color
          <input
            className={inputClass}
            name="secondaryColor"
            type="color"
            defaultValue={club?.secondaryColor ?? "#071713"}
            required
          />
          <FieldError errors={state.fieldErrors?.secondaryColor} />
        </label>
        <label className="text-sm font-medium text-zinc-300">
          Founded year
          <input
            className={inputClass}
            name="foundedYear"
            type="number"
            min={1800}
            max={new Date().getFullYear()}
            defaultValue={club?.foundedYear ?? ""}
          />
          <FieldError errors={state.fieldErrors?.foundedYear} />
        </label>
        <label className="text-sm font-medium text-zinc-300">
          Logo URL
          <input className={inputClass} name="logoUrl" type="url" defaultValue={club?.logoUrl ?? ""} />
          <FieldError errors={state.fieldErrors?.logoUrl} />
        </label>
        <label className="text-sm font-medium text-zinc-300 md:col-span-2">
          Website URL
          <input
            className={inputClass}
            name="websiteUrl"
            type="url"
            defaultValue={club?.websiteUrl ?? ""}
          />
          <FieldError errors={state.fieldErrors?.websiteUrl} />
        </label>
      </div>
      <button
        className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
