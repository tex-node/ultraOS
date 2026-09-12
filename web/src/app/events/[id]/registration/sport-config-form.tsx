"use client";

import { useActionState, useMemo, useState } from "react";
import { RegistrationSport } from "@/generated/prisma/enums";
import { FLAG_RACE_ROSTER, VOLLEYBALL_ROSTER, describeRoster } from "@/lib/registration/sport-config-admin";
import { saveSportConfigAction, type SportConfigFormState } from "./actions";

type Roster = { minRoster: number; maxRoster: number; activeCount?: number; substitutesAllowed: boolean; orderRequired: boolean };
type Existing = {
  title: string; description: string | null; status: string; publicEnabled: boolean;
  capacity: number | null; opensAt: string | null; closesAt: string | null;
  config: { sports: string[]; requireBothSports: boolean; dualParticipationAllowed: boolean; minAge: number; maxAge: number; requireGuardianConsent: boolean; gender: string; rosters: Record<string, Roster | undefined> };
};

const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm";

export function SportConfigForm({ eventId, existing }: { eventId: string; existing: Existing | null }) {
  const [state, action, pending] = useActionState<SportConfigFormState, FormData>(saveSportConfigAction.bind(null, eventId), {});
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [status, setStatus] = useState(existing?.status ?? "DRAFT");
  const [publicEnabled, setPublicEnabled] = useState(existing?.publicEnabled ?? false);
  const [capacity, setCapacity] = useState(existing?.capacity?.toString() ?? "");
  const [opensAt, setOpensAt] = useState(existing?.opensAt?.slice(0, 16) ?? "");
  const [closesAt, setClosesAt] = useState(existing?.closesAt?.slice(0, 16) ?? "");

  const [sports, setSports] = useState<string[]>(existing?.config.sports ?? [RegistrationSport.VOLLEYBALL, RegistrationSport.FLAG_RACE]);
  const [requireBothSports, setRequireBothSports] = useState(existing?.config.requireBothSports ?? true);
  const [dualParticipation, setDualParticipation] = useState(existing?.config.dualParticipationAllowed ?? true);
  const [gender, setGender] = useState(existing?.config.gender ?? "FEMALE");
  const [minAge, setMinAge] = useState(String(existing?.config.minAge ?? 6));
  const [maxAge, setMaxAge] = useState(String(existing?.config.maxAge ?? 12));
  const [requireGuardianConsent, setRequireGuardianConsent] = useState(existing?.config.requireGuardianConsent ?? true);
  const [volleyball, setVolleyball] = useState<Roster>(existing?.config.rosters.VOLLEYBALL ?? VOLLEYBALL_ROSTER);
  const [flagRace, setFlagRace] = useState<Roster>(existing?.config.rosters.FLAG_RACE ?? FLAG_RACE_ROSTER);

  const toggleSport = (sport: string, on: boolean) => setSports((current) => (on ? [...new Set([...current, sport])] : current.filter((item) => item !== sport)));

  const payload = useMemo(() => JSON.stringify({
    title, description, status, publicEnabled, capacity, opensAt: opensAt || null, closesAt: closesAt || null,
    config: {
      sports, requireBothSports, dualParticipationAllowed: dualParticipation, minAge: Number(minAge), maxAge: Number(maxAge),
      requireGuardianConsent, requireCompleteRosters: true, gender,
      rosters: {
        ...(sports.includes(RegistrationSport.VOLLEYBALL) ? { VOLLEYBALL: volleyball } : {}),
        ...(sports.includes(RegistrationSport.FLAG_RACE) ? { FLAG_RACE: { ...flagRace, minRoster: 6, maxRoster: 6, activeCount: 6, substitutesAllowed: false, orderRequired: true } } : {}),
      },
    },
  }), [title, description, status, publicEnabled, capacity, opensAt, closesAt, sports, requireBothSports, dualParticipation, minAge, maxAge, requireGuardianConsent, gender, volleyball, flagRace]);

  return (
    <form action={action} className="mt-8 space-y-6">
      <input type="hidden" name="payload" value={payload} />
      {state.error ? <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">{state.error}</p> : null}
      {state.success ? <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-300">{state.success}</p> : null}

      <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <h2 className="text-lg font-semibold">Form settings</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block text-xs text-zinc-400">Title<input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="block text-xs text-zinc-400">Status<select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>{["DRAFT", "OPEN", "CLOSED"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="block text-xs text-zinc-400">Capacity<input type="number" min={0} className={inputClass} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
          <label className="block text-xs text-zinc-400 md:col-span-3">Description<textarea rows={2} className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="block text-xs text-zinc-400">Opens<input type="datetime-local" className={inputClass} value={opensAt} onChange={(event) => setOpensAt(event.target.value)} /></label>
          <label className="block text-xs text-zinc-400">Closes<input type="datetime-local" className={inputClass} value={closesAt} onChange={(event) => setClosesAt(event.target.value)} /></label>
          <label className="flex items-center gap-2 self-end text-xs text-zinc-300"><input type="checkbox" checked={publicEnabled} onChange={(event) => setPublicEnabled(event.target.checked)} />Publicly visible</label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <h2 className="text-lg font-semibold">Sports</h2>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-200">
          <label className="flex items-center gap-2"><input type="checkbox" checked={sports.includes(RegistrationSport.VOLLEYBALL)} onChange={(event) => toggleSport(RegistrationSport.VOLLEYBALL, event.target.checked)} />Volleyball</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={sports.includes(RegistrationSport.FLAG_RACE)} onChange={(event) => toggleSport(RegistrationSport.FLAG_RACE, event.target.checked)} />Flag Race</label>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={requireBothSports} onChange={(event) => setRequireBothSports(event.target.checked)} />Teams must register both sports</label>
          <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={dualParticipation} onChange={(event) => setDualParticipation(event.target.checked)} />Allow a child on both rosters</label>
          <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={requireGuardianConsent} onChange={(event) => setRequireGuardianConsent(event.target.checked)} />Require guardian consent per child</label>
          <label className="block text-xs text-zinc-400">Gender<select className={inputClass} value={gender} onChange={(event) => setGender(event.target.value)}>{["FEMALE", "MALE", "ANY"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="block text-xs text-zinc-400">Minimum age<input type="number" min={0} className={inputClass} value={minAge} onChange={(event) => setMinAge(event.target.value)} /></label>
          <label className="block text-xs text-zinc-400">Maximum age<input type="number" min={0} className={inputClass} value={maxAge} onChange={(event) => setMaxAge(event.target.value)} /></label>
        </div>
      </section>

      {sports.includes(RegistrationSport.VOLLEYBALL) ? (
        <RosterPanel title="Volleyball" roster={volleyball} onChange={setVolleyball} />
      ) : null}
      {sports.includes(RegistrationSport.FLAG_RACE) ? (
        <RosterPanel title="Flag Race" roster={{ ...flagRace, minRoster: 6, maxRoster: 6, activeCount: 6, substitutesAllowed: false, orderRequired: true }} onChange={setFlagRace} locked />
      ) : null}

      <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <h2 className="text-lg font-semibold">Resulting roster rules</h2>
        <ul className="mt-3 space-y-1 text-sm text-zinc-300">
          {sports.includes(RegistrationSport.VOLLEYBALL) ? <li>{describeRoster("Volleyball", volleyball)}</li> : null}
          {sports.includes(RegistrationSport.FLAG_RACE) ? <li>{describeRoster("Flag Race", { ...flagRace, minRoster: 6, maxRoster: 6, activeCount: 6, substitutesAllowed: false, orderRequired: true })}</li> : null}
          {sports.length === 0 ? <li className="text-amber-300">Select at least one sport.</li> : null}
        </ul>
      </section>

      <button disabled={pending} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40">{pending ? "Saving…" : "Save configuration"}</button>
    </form>
  );
}

function RosterPanel({ title, roster, onChange, locked = false }: { title: string; roster: Roster; onChange: (next: Roster) => void; locked?: boolean }) {
  return (
    <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <h2 className="text-lg font-semibold">{title} roster</h2>
      {locked ? <p className="mt-1 text-xs text-amber-300">Fixed by {title} rules: exactly 6 athletes, no substitutes, order required.</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <label className="block text-xs text-zinc-400">Min roster<input type="number" min={0} className={inputClass} value={roster.minRoster} disabled={locked} onChange={(event) => onChange({ ...roster, minRoster: Number(event.target.value) })} /></label>
        <label className="block text-xs text-zinc-400">Max roster<input type="number" min={1} className={inputClass} value={roster.maxRoster} disabled={locked} onChange={(event) => onChange({ ...roster, maxRoster: Number(event.target.value) })} /></label>
        <label className="block text-xs text-zinc-400">Active count<input type="number" min={0} className={inputClass} value={roster.activeCount ?? ""} disabled={locked} onChange={(event) => onChange({ ...roster, activeCount: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
        <label className="flex items-center gap-2 self-end text-xs text-zinc-300"><input type="checkbox" checked={roster.substitutesAllowed} disabled={locked} onChange={(event) => onChange({ ...roster, substitutesAllowed: event.target.checked })} />Substitutes</label>
        <label className="flex items-center gap-2 self-end text-xs text-zinc-300"><input type="checkbox" checked={roster.orderRequired} disabled={locked} onChange={(event) => onChange({ ...roster, orderRequired: event.target.checked })} />Order required</label>
      </div>
    </section>
  );
}
