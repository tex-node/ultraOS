"use client";

import { useActionState, useMemo, useState } from "react";
import { submitTeamRegistration, type RegistrationFormState } from "./actions";

type FieldView = { key: string; label: string; type: string; scope: string; required: boolean; options: string[] | null };
type RosterView = { minRoster: number; maxRoster: number; activeCount?: number; substitutesAllowed: boolean; orderRequired: boolean } | undefined;

type ParticipantRow = {
  clientId: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  guardianName: string;
  guardianPhone: string;
  consentAccepted: boolean;
  volleyball: boolean;
  volleyballActive: boolean;
  flagRace: boolean;
  raceOrder: number;
  answers: Record<string, string>;
};

let rowSeq = 0;
function newRow(): ParticipantRow {
  rowSeq += 1;
  return { clientId: `p${rowSeq}-${Date.now()}`, fullName: "", dateOfBirth: "", gender: "FEMALE", guardianName: "", guardianPhone: "", consentAccepted: false, volleyball: true, volleyballActive: true, flagRace: false, raceOrder: rowSeq, answers: {} };
}

function FieldInput({ field, value, onChange }: { field: FieldView; value: string; onChange: (next: string) => void }) {
  const cls = "mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm";
  if (field.type === "SELECT" && field.options) {
    return (
      <label className="block text-xs text-zinc-400">
        {field.label}{field.required ? " *" : ""}
        <select className={cls} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select…</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === "TEXTAREA") return <label className="block text-xs text-zinc-400">{field.label}{field.required ? " *" : ""}<textarea className={cls} rows={2} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
  if (field.type === "CONSENT" || field.type === "CHECKBOX") return <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={value === "true"} onChange={(event) => onChange(event.target.checked ? "true" : "")} />{field.label}{field.required ? " *" : ""}</label>;
  const inputType = field.type === "EMAIL" ? "email" : field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : field.type === "PHONE" ? "tel" : "text";
  return <label className="block text-xs text-zinc-400">{field.label}{field.required ? " *" : ""}<input className={cls} type={inputType} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function RegistrationFormView({
  organizationSlug, eventSlug, accepting, confirmationMessage, fields, requireGuardianConsent, rosters, individualSports, guardianConsentUnderAge,
}: {
  organizationSlug: string;
  eventSlug: string;
  mode: string;
  accepting: boolean;
  confirmationMessage: string | null;
  fields: FieldView[];
  sports: string[];
  requireBothSports: boolean;
  requireGuardianConsent: boolean;
  rosters: Record<string, RosterView>;
  gender: string;
  individualSports: string[];
  guardianConsentUnderAge: number | null;
}) {
  const [state, action, pending] = useActionState<RegistrationFormState, FormData>(submitTeamRegistration.bind(null, organizationSlug, eventSlug), {});
  const [registrationMode, setRegistrationMode] = useState<"TEAM" | "INDIVIDUAL">("TEAM");
  const [individualSport, setIndividualSport] = useState<string>(individualSports[0] ?? "");
  const isIndividual = registrationMode === "INDIVIDUAL" && individualSports.length > 0;
  const [teamName, setTeamName] = useState("");
  const [club, setClub] = useState("");
  const [category, setCategory] = useState("");
  const [submissionAnswers, setSubmissionAnswers] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<ParticipantRow[]>([newRow()]);

  const submissionFields = fields.filter((field) => field.scope === "SUBMISSION");
  const participantFields = fields.filter((field) => field.scope === "PARTICIPANT");

  const update = (clientId: string, patch: Partial<ParticipantRow>) =>
    setParticipants((rows) => rows.map((row) => (row.clientId === clientId ? { ...row, ...patch } : row)));

  const payload = useMemo(() => {
    const rows = isIndividual ? participants.slice(0, 1) : participants;
    return JSON.stringify({
      registrationMode: isIndividual ? "INDIVIDUAL" : "TEAM",
      teamName: isIndividual ? undefined : teamName,
      teamClubOrSchool: club,
      teamCategory: category,
      submissionAnswers,
      participants: rows.map((row) => ({
        clientId: row.clientId, fullName: row.fullName, dateOfBirth: row.dateOfBirth || undefined, gender: row.gender || undefined,
        guardianName: row.guardianName || undefined, guardianPhone: row.guardianPhone || undefined, consentAccepted: row.consentAccepted,
        sportMemberships: isIndividual
          ? [{ sport: individualSport }]
          : [
              ...(row.volleyball ? [{ sport: "VOLLEYBALL", isActive: row.volleyballActive }] : []),
              ...(row.flagRace ? [{ sport: "FLAG_RACE", rosterOrder: row.raceOrder }] : []),
            ],
        answers: Object.fromEntries(Object.entries(row.answers).filter(([, value]) => value !== "")),
      })),
    });
  }, [isIndividual, individualSport, teamName, club, category, submissionAnswers, participants]);

  if (state.success) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-6">
        <h2 className="text-xl font-semibold text-emerald-300">Registration saved</h2>
        <p className="mt-2 text-sm text-zinc-300">Reference: <b>{state.success.referenceNumber}</b> ({state.success.status})</p>
        {confirmationMessage ? <p className="mt-3 text-sm text-zinc-400">{confirmationMessage}</p> : null}
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-8">
      <input type="hidden" name="payload" value={payload} />
      {state.error ? <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">{state.error}</p> : null}

      {individualSports.length > 0 ? (
        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">How are you registering?</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-200">
            <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2"><input type="radio" name="registrationModeChoice" checked={!isIndividual} onChange={() => setRegistrationMode("TEAM")} />A team</label>
            <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2"><input type="radio" name="registrationModeChoice" checked={isIndividual} onChange={() => setRegistrationMode("INDIVIDUAL")} />An individual athlete</label>
          </div>
          {isIndividual && individualSports.length > 1 ? (
            <label className="mt-3 block text-xs text-zinc-400">Sport<select className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm" value={individualSport} onChange={(event) => setIndividualSport(event.target.value)}>{individualSports.map((sport) => <option key={sport} value={sport}>{sport.replace(/_/g, " ")}</option>)}</select></label>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <h2 className="text-lg font-semibold">{isIndividual ? "Athlete details" : "Team details"}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {!isIndividual ? <label className="block text-xs text-zinc-400">Team name *<input className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm" value={teamName} onChange={(event) => setTeamName(event.target.value)} /></label> : null}
          <label className="block text-xs text-zinc-400">School / club / academy<input className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm" value={club} onChange={(event) => setClub(event.target.value)} /></label>
          <label className="block text-xs text-zinc-400">Category<input className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm" value={category} onChange={(event) => setCategory(event.target.value)} /></label>
        </div>
        {submissionFields.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {submissionFields.map((field) => <FieldInput key={field.key} field={field} value={submissionAnswers[field.key] ?? ""} onChange={(value) => setSubmissionAnswers((prev) => ({ ...prev, [field.key]: value }))} />)}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isIndividual ? "Athlete" : "Participants"}</h2>
          {!isIndividual ? <button type="button" className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs text-emerald-300" onClick={() => setParticipants((rows) => [...rows, newRow()])}>Add participant</button> : null}
        </div>
        {isIndividual ? <p className="mt-2 text-xs text-zinc-500">Registering one athlete for {individualSport.replace(/_/g, " ")} (no team).</p> : null}
        <p className="mt-2 text-xs text-zinc-500">
          Volleyball roster {rosters.VOLLEYBALL ? `${rosters.VOLLEYBALL.minRoster}–${rosters.VOLLEYBALL.maxRoster}` : "n/a"}; Flag Race {rosters.FLAG_RACE ? `${rosters.FLAG_RACE.minRoster}–${rosters.FLAG_RACE.maxRoster}` : "n/a"}.
        </p>
        <div className="mt-4 space-y-4">
          {(isIndividual ? participants.slice(0, 1) : participants).map((row, index) => (
            <div key={row.clientId} className="rounded-xl border border-white/[.06] bg-black/20 p-4">
              <div className="flex items-center justify-between"><b className="text-sm">{isIndividual ? "Athlete" : `Child ${index + 1}`}</b>{!isIndividual && participants.length > 1 ? <button type="button" className="text-xs text-rose-300" onClick={() => setParticipants((rows) => rows.filter((item) => item.clientId !== row.clientId))}>Remove</button> : null}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="block text-xs text-zinc-400">Full name *<input className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm" value={row.fullName} onChange={(event) => update(row.clientId, { fullName: event.target.value })} /></label>
                <label className="block text-xs text-zinc-400">Date of birth *<input type="date" className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm" value={row.dateOfBirth} onChange={(event) => update(row.clientId, { dateOfBirth: event.target.value })} /></label>
                <label className="block text-xs text-zinc-400">Gender<select className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm" value={row.gender} onChange={(event) => update(row.clientId, { gender: event.target.value })}><option value="FEMALE">Female</option><option value="MALE">Male</option></select></label>
              </div>
              {isIndividual ? (
                <p className="mt-3 text-xs text-zinc-400">Sport: <b className="text-zinc-200">{individualSport.replace(/_/g, " ")}</b></p>
              ) : (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-300">
                <label className="flex items-center gap-2"><input type="checkbox" checked={row.volleyball} onChange={(event) => update(row.clientId, { volleyball: event.target.checked })} />Volleyball</label>
                {row.volleyball && rosters.VOLLEYBALL?.activeCount ? <label className="flex items-center gap-2"><input type="checkbox" checked={row.volleyballActive} onChange={(event) => update(row.clientId, { volleyballActive: event.target.checked })} />Active (non-substitute)</label> : null}
                <label className="flex items-center gap-2"><input type="checkbox" checked={row.flagRace} onChange={(event) => update(row.clientId, { flagRace: event.target.checked })} />Flag Race</label>
                {row.flagRace && rosters.FLAG_RACE?.orderRequired ? <label className="flex items-center gap-2">Race order<input type="number" min={1} className="w-20 rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-sm" value={row.raceOrder} onChange={(event) => update(row.clientId, { raceOrder: Number(event.target.value) })} /></label> : null}
              </div>
              )}
              {requireGuardianConsent ? (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="block text-xs text-zinc-400">Guardian name{guardianConsentUnderAge == null ? " *" : ""}<input className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm" value={row.guardianName} onChange={(event) => update(row.clientId, { guardianName: event.target.value })} /></label>
                  <label className="block text-xs text-zinc-400">Guardian phone{guardianConsentUnderAge == null ? " *" : ""}<input className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm" value={row.guardianPhone} onChange={(event) => update(row.clientId, { guardianPhone: event.target.value })} /></label>
                  <label className="flex items-center gap-2 self-end text-xs text-zinc-300"><input type="checkbox" checked={row.consentAccepted} onChange={(event) => update(row.clientId, { consentAccepted: event.target.checked })} />Guardian consent given{guardianConsentUnderAge == null ? " *" : ` (required under ${guardianConsentUnderAge})`}</label>
                </div>
              ) : null}
              {participantFields.length > 0 ? (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {participantFields.map((field) => <FieldInput key={field.key} field={field} value={row.answers[field.key] ?? ""} onChange={(value) => update(row.clientId, { answers: { ...row.answers, [field.key]: value } })} />)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" name="intent" value="DRAFT" disabled={!accepting || pending} className="rounded-xl border border-white/15 px-5 py-3 text-sm disabled:opacity-40">Save draft</button>
        <button type="submit" name="intent" value="SUBMIT" disabled={!accepting || pending} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{pending ? "Saving…" : isIndividual ? "Submit registration" : "Submit team registration"}</button>
      </div>
    </form>
  );
}
