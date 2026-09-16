"use client";

import { useActionState } from "react";
import { generateSchedule, type ScheduleFormState } from "./actions";

const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white";
const labelClass = "block text-sm text-zinc-300";

export function GenerateScheduleForm({
  competitionId,
  seasons,
  divisions,
  venues,
  events,
}: {
  competitionId: string;
  seasons: { id: string; name: string }[];
  divisions: { id: string; name: string }[];
  venues: { id: string; name: string }[];
  events: { id: string; name: string; seasonName: string }[];
}) {
  const [state, action, pending] = useActionState<ScheduleFormState, FormData>(generateSchedule, {});
  const done = typeof state.created === "number" && !state.error;

  return (
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="competitionId" value={competitionId} />

      <label className={labelClass}>
        Season
        <select name="seasonId" required className={inputClass}>
          <option value="">Select season</option>
          {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Division
        <select name="divisionId" required className={inputClass}>
          <option value="">Select division</option>
          {divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Venue
        <select name="venueId" required className={inputClass}>
          <option value="">Select venue</option>
          {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Start date
        <input name="startDate" type="date" required className={inputClass} />
      </label>
      <label className={labelClass}>
        Days between rounds
        <input name="intervalDays" type="number" min="0" max="30" defaultValue={7} className={inputClass} />
      </label>
      {events.length ? (
        <label className={labelClass}>
          Event (optional)
          <select name="eventId" defaultValue="" className={inputClass}>
            <option value="">Not attached to an event</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name} — {event.seasonName}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-zinc-500">
            Attach these fixtures to a match-day event so its game staff can run them.
          </span>
        </label>
      ) : null}
      <label className={labelClass}>
        Slot length (hours)
        <input name="slotHours" type="number" min="1" max="12" defaultValue={2} className={inputClass} />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm text-zinc-300">Game days</legend>
        <p className="mt-0.5 text-xs text-zinc-500">
          Leave all unchecked to keep the plain date pattern. Check days to play only on those weekdays — a
          weekends-only league is Saturday + Sunday.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {[["SUN", "Sun"], ["MON", "Mon"], ["TUE", "Tue"], ["WED", "Wed"], ["THU", "Thu"], ["FRI", "Fri"], ["SAT", "Sat"]].map(
            ([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" name="gameDays" value={value} /> {label}
              </label>
            ),
          )}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" name="spreadGameDays" defaultChecked /> Spread a round&apos;s matches across the selected days
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" name="doubleRound" /> Double round-robin (home &amp; away)
      </label>

      {state.error ? (
        <p role="alert" className="sm:col-span-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{state.error}</p>
      ) : null}
      {done ? (
        <p className="sm:col-span-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {state.created} fixture{state.created === 1 ? "" : "s"} created
          {state.conflicts ? ` · ${state.conflicts} fixture${state.conflicts === 1 ? "" : "s"} could not be placed (no free slot)` : ""}.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="sm:col-span-2 rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate schedule"}
      </button>
    </form>
  );
}
