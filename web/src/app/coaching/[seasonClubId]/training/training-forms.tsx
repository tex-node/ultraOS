"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { TrainingState } from "./actions";

// The two I3 forms: assign an adopted plan to a new session, and complete a session with the plan's
// target metric. Both surface the action's error verbatim - a coach who typed "8/10" into a numeric
// field must see why that was rejected rather than a silent no-op.

type Action = (state: TrainingState, formData: FormData) => Promise<TrainingState>;

const control = "min-h-[40px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm text-text-1";

export type AssignablePlan = {
  id: string;
  playerName: string;
  jerseyNumber: number | null;
  focusAreas: { label: string; metricLabel: string; targetLabel: string }[];
};

export function AssignForm({ action, plans, seasonClubId }: { action: Action; plans: AssignablePlan[]; seasonClubId: string }) {
  const [state, formAction, pending] = useActionState(action, {} as TrainingState);
  if (plans.length === 0) {
    return (
      <p className="mt-2 text-sm text-text-2">
        No active plan to assign yet. Adopt a plan on a player&apos;s page first, then come back -{" "}
        <Link href={`/coaching/${seasonClubId}/squad`} className="text-info underline">
          open the squad
        </Link>
        .
      </p>
    );
  }
  return (
    <form action={formAction} className="mt-3 space-y-2">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger/10 p-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="rounded-md bg-success/10 p-2 text-sm text-success">
          Session created.{" "}
          <Link href={`/coaching/${seasonClubId}/training/${state.saved}`} className="underline">
            Open it
          </Link>
        </p>
      ) : null}
      <label className="block text-xs text-text-3">
        Plan
        <select name="planId" required className={`${control} mt-1`}>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.jerseyNumber != null ? `#${plan.jerseyNumber} ` : ""}
              {plan.playerName} - {plan.focusAreas.map((area) => area.label).join(", ")}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-text-3">
          Title (optional)
          <input name="title" maxLength={160} placeholder="e.g. Ball security block" className={`${control} mt-1`} />
        </label>
        <label className="block text-xs text-text-3">
          Type
          <select name="sessionType" defaultValue="SKILLS" className={`${control} mt-1`}>
            {["SKILLS", "SHOOTING", "TEAM_PRACTICE", "STRENGTH", "CONDITIONING", "TACTICAL", "RECOVERY"].map((type) => (
              <option key={type} value={type}>
                {type.replace("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-text-3">
          Date
          <input name="occurredAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={`${control} mt-1`} />
        </label>
        <label className="block text-xs text-text-3">
          Duration (minutes)
          <input name="durationMinutes" type="number" min={5} max={240} defaultValue={45} className={`${control} mt-1`} />
        </label>
      </div>
      <button type="submit" disabled={pending} className="min-h-[40px] rounded-md bg-brand-400 px-4 text-sm font-bold text-ink-900">
        {pending ? "Creating…" : "Assign to a new session"}
      </button>
    </form>
  );
}

export type CompletableSession = {
  id: string;
  title: string;
  occurredAt: string;
  completedAt: string | null;
  playerName: string | null;
  focusAreas: { label: string; metricKey: string; metricLabel: string; targetLabel: string; loggedValue: string | null }[];
};

export function CompleteForm({ action, session, seasonClubId }: { action: Action; session: CompletableSession; seasonClubId: string }) {
  const [state, formAction, pending] = useActionState(action, {} as TrainingState);
  return (
    <form action={formAction} className="mt-3 space-y-3">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger/10 p-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.completed || session.completedAt ? (
        <p role="status" className="rounded-md bg-success/10 p-2 text-sm text-success">
          Session complete. The logged metric is attached to {session.playerName ?? "the player"}&apos;s record.
        </p>
      ) : null}

      {session.focusAreas.length > 0 ? (
        <div className="rounded-md border border-line bg-ink-800 p-3">
          <p className="text-xs text-text-3">Log the plan&apos;s target metric (as printed on the plan)</p>
          <div className="mt-2 space-y-2">
            {session.focusAreas.map((area) => (
              <label key={area.metricKey} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-2">
                  {area.metricLabel} <span className="text-xs text-text-3">(target {area.targetLabel})</span>
                </span>
                <input name={`metric:${area.metricKey}`} type="number" step="0.1" defaultValue={area.loggedValue ?? ""} className="w-32 rounded border border-line bg-ink-700 px-2 py-1 text-right text-sm tabular-nums" />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <label className="block text-xs text-text-3">
        Attendance for the player
        <select name="attendanceStatus" defaultValue="PRESENT" className={`${control} mt-1`}>
          {["PRESENT", "LATE", "LIMITED", "EXCUSED", "ABSENT"].map((value) => (
            <option key={value} value={value}>
              {value.toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-text-3">
        Note (optional)
        <input name="note" maxLength={500} placeholder="e.g. 8/10 free throws, good rhythm" className={`${control} mt-1`} />
      </label>
      <button type="submit" disabled={pending} className="min-h-[40px] rounded-md bg-brand-400 px-4 text-sm font-bold text-ink-900">
        {pending ? "Saving…" : session.completedAt ? "Update completion" : "Mark complete"}
      </button>
      <p className="text-xs text-text-3">
        <Link href={`/coaching/${seasonClubId}/training`} className="text-info underline">
          Back to the training week
        </Link>
      </p>
    </form>
  );
}
