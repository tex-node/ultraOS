"use client";

import { useActionState } from "react";
import { createNoveltyMatch, type NoveltyMatchState } from "@/app/novelty-matches/actions";

type Team = { id: string; name: string };
type Option = { id: string; name: string };

export function CreateNoveltyMatchForm({ teams, events, venues }: { teams: Team[]; events: Option[]; venues: Option[] }) {
  const [state, action, pending] = useActionState<NoveltyMatchState, FormData>(createNoveltyMatch, {});

  return (
    <form action={action} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
      {state.error ? <p className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">{state.error}</p> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-sm text-zinc-300">
          Match name
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="name" placeholder="e.g. All-Star Exhibition" required />
        </label>
        <label className="block text-sm text-zinc-300">
          Home team
          <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="homeTeamId" required>
            <option value="">Select team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          Away team
          <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="awayTeamId" required>
            <option value="">Select team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          Scheduled at
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="scheduledAt" required type="datetime-local" />
        </label>
        <label className="block text-sm text-zinc-300">
          Event (optional)
          <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="eventId">
            <option value="">No event</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          Venue (optional)
          <select className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" name="venueId">
            <option value="">No venue</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      </div>
      <button className="mt-5 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60" disabled={pending}>
        {pending ? "Creating..." : "Create exhibition match"}
      </button>
    </form>
  );
}
