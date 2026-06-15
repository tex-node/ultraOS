"use client";

import { useActionState } from "react";
import type { SeasonClubStatus, StaffRole } from "@/generated/prisma/enums";
import type { ClubFormState } from "@/lib/club-validation";

type SeasonClubAction = (
  state: ClubFormState,
  formData: FormData,
) => Promise<ClubFormState>;

type Option = { id: string; name: string };
type StaffOption = Option & { role: StaffRole };

type SeasonClubFormProps = {
  action: SeasonClubAction;
  club: Option;
  seasons: Array<Option & { competitionId: string; competitionName: string }>;
  divisions: Array<Option & { competitionId: string }>;
  staff: StaffOption[];
  registration?: {
    seasonId: string;
    divisionId: string;
    headCoachId: string | null;
    assistantCoachId: string | null;
    teamManagerId: string | null;
    scoutId: string | null;
    fanCaptainId: string | null;
    status: SeasonClubStatus;
  };
  submitLabel: string;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400";

function roleOptions(staff: StaffOption[], role: StaffRole) {
  return staff.filter((person) => person.role === role);
}

function StaffSelect({
  name,
  label,
  role,
  staff,
  defaultValue,
}: {
  name: string;
  label: string;
  role: StaffRole;
  staff: StaffOption[];
  defaultValue?: string | null;
}) {
  return (
    <label className="text-sm font-medium text-zinc-300">
      {label}
      <select className={inputClass} name={name} defaultValue={defaultValue ?? ""}>
        <option value="">Unassigned</option>
        {roleOptions(staff, role).map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SeasonClubForm({
  action,
  club,
  seasons,
  divisions,
  staff,
  registration,
  submitLabel,
}: SeasonClubFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-6">
      <input name="clubId" type="hidden" value={club.id} />
      {state.error ? (
        <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">
          {state.error}
        </p>
      ) : null}
      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Permanent club</p>
        <p className="mt-1 font-semibold text-white">{club.name}</p>
        <p className="mt-1 text-xs text-zinc-400">
          This form creates or edits the club&apos;s participation in a season.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-sm font-medium text-zinc-300">
          Season
          <select
            className={inputClass}
            name="seasonId"
            defaultValue={registration?.seasonId}
            required
          >
            <option value="">Select season</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name} - {season.competitionName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-zinc-300">
          Division
          <select
            className={inputClass}
            name="divisionId"
            defaultValue={registration?.divisionId}
            required
          >
            <option value="">Select division</option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-zinc-300">
          Registration status
          <select
            className={inputClass}
            name="status"
            defaultValue={registration?.status ?? "ACTIVE"}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="WITHDRAWN">Withdrawn</option>
          </select>
        </label>
        <div />
        <StaffSelect
          name="headCoachId"
          label="Head coach"
          role="HEAD_COACH"
          staff={staff}
          defaultValue={registration?.headCoachId}
        />
        <StaffSelect
          name="assistantCoachId"
          label="Assistant coach"
          role="ASSISTANT_COACH"
          staff={staff}
          defaultValue={registration?.assistantCoachId}
        />
        <StaffSelect
          name="teamManagerId"
          label="Team manager"
          role="TEAM_MANAGER"
          staff={staff}
          defaultValue={registration?.teamManagerId}
        />
        <StaffSelect
          name="scoutId"
          label="Scout"
          role="SCOUT"
          staff={staff}
          defaultValue={registration?.scoutId}
        />
        <StaffSelect
          name="fanCaptainId"
          label="Fan captain"
          role="FAN_CAPTAIN"
          staff={staff}
          defaultValue={registration?.fanCaptainId}
        />
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
