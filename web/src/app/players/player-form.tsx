"use client";

import { useActionState } from "react";
import type { PlayerStatus } from "@/generated/prisma/enums";
import type { PlayerFormState } from "@/lib/player-validation";

type Action = (state: PlayerFormState, formData: FormData) => Promise<PlayerFormState>;
type PlayerValue = { id: string; seasonId: string; seasonClubId: string | null; position: string; heightCm: number; weightKg: number; jerseyNumber: number | null; status: PlayerStatus };
const field = "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400";

export function PlayerForm({ action, athleteId, seasons, seasonClubs, player, label }: {
  action: Action; athleteId: string; seasons: Array<{id:string;name:string}>;
  seasonClubs: Array<{id:string;seasonId:string;label:string}>; player?: PlayerValue; label:string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="space-y-6">
    <input type="hidden" name="athleteId" value={athleteId} />
    {state.error ? <p className="rounded-xl bg-rose-400/10 p-3 text-sm text-rose-300">{state.error}</p> : null}
    <div className="grid gap-5 md:grid-cols-2">
      <label className="text-sm text-zinc-300">Season<select className={field} name="seasonId" defaultValue={player?.seasonId} required><option value="">Select season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-sm text-zinc-300">SeasonClub roster<select className={field} name="seasonClubId" defaultValue={player?.seasonClubId ?? ""}><option value="">Unassigned / draft pool</option>{seasonClubs.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      <label className="text-sm text-zinc-300">Position<input className={field} name="position" defaultValue={player?.position} required /></label>
      <label className="text-sm text-zinc-300">Jersey number<input className={field} name="jerseyNumber" type="number" min="0" max="999" defaultValue={player?.jerseyNumber ?? ""} /></label>
      <label className="text-sm text-zinc-300">Height (cm)<input className={field} name="heightCm" type="number" min="120" max="260" defaultValue={player?.heightCm} required /></label>
      <label className="text-sm text-zinc-300">Weight (kg)<input className={field} name="weightKg" type="number" min="35" max="250" defaultValue={player?.weightKg} required /></label>
      <label className="text-sm text-zinc-300">Status<select className={field} name="status" defaultValue={player?.status ?? "REGISTERED"}>{["REGISTERED","VERIFIED","COMBINE_INVITE","DRAFT_ELIGIBLE","DRAFTED","UNDRAFTED","INACTIVE"].map(s=><option key={s}>{s}</option>)}</select></label>
    </div>
    <button className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60" disabled={pending}>{pending ? "Saving..." : label}</button>
  </form>;
}
