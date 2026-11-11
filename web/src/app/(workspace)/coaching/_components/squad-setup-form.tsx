"use client";

import { useActionState, useState } from "react";
import { heightField, parseSquadSetup, POSITION_OPTIONS, positionField, HEIGHT_MIN_CM, HEIGHT_MAX_CM, type SquadSetupErrors } from "@/lib/coaching/squad-setup";

export type SquadSetupState = { saved?: number; errors?: SquadSetupErrors; error?: string };
export type SquadSetupPlayer = { playerId: string; name: string; jerseyNumber: number | null; position: string | null; usablePosition: boolean; heightCm: number | null; usableHeight: boolean };

type Action = (state: SquadSetupState, formData: FormData) => Promise<SquadSetupState>;

const control = "min-h-[44px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm text-text-1 [color-scheme:dark] focus:border-brand-400 focus:outline-none";

function valuesOf(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
}

// The same validation runs here (instant feedback, nothing sent when invalid) and again on the
// server. Blank fields mean "leave as is": Player.position and heightCm are NOT NULL, so they
// cannot be emptied.
export function SquadSetupForm({ action, players }: { action: Action; players: SquadSetupPlayer[] }) {
  const [state, formAction, pending] = useActionState(action, {} as SquadSetupState);
  const [clientErrors, setClientErrors] = useState<SquadSetupErrors | null>(null);
  const errors = clientErrors ?? state.errors;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const parsed = parseSquadSetup(valuesOf(e.currentTarget), players.map((p) => p.playerId));
        if (!parsed.ok) {
          e.preventDefault();
          setClientErrors(parsed.errors);
        } else {
          setClientErrors(null);
        }
      }}
      className="space-y-3"
    >
      {state.error ? <p role="alert" className="rounded-md bg-danger/10 p-3 text-sm text-danger">{state.error}</p> : null}
      {state.saved != null && !clientErrors ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">
          {state.saved === 0 ? "Nothing to change." : `Saved ${state.saved} player${state.saved === 1 ? "" : "s"}.`}
        </p>
      ) : null}
      <ul className="space-y-3">
        {players.map((p) => {
          const err = errors?.[p.playerId];
          return (
            <li key={p.playerId} data-player={p.playerId} className="rounded-lg border border-line bg-ink-800 p-3">
              <p className="text-sm font-semibold text-text-1">
                {p.jerseyNumber != null ? <span className="mr-1 tabular-nums text-text-3">#{p.jerseyNumber}</span> : null}
                {p.name}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="block text-xs text-text-2">
                  Position
                  <select name={positionField(p.playerId)} defaultValue="" className={`${control} mt-1`} aria-label={`Position for ${p.name}`}>
                    <option value="">{p.usablePosition ? `Keep ${p.position}` : "Not set"}</option>
                    {POSITION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <span data-error="position" className="mt-1 block min-h-[1rem] text-xs text-danger">{err?.position ?? ""}</span>
                </label>
                <label className="block text-xs text-text-2">
                  Height (cm)
                  <input
                    name={heightField(p.playerId)}
                    inputMode="numeric"
                    defaultValue=""
                    placeholder={p.usableHeight ? String(p.heightCm) : "Not set"}
                    aria-label={`Height in cm for ${p.name}`}
                    className={`${control} mt-1 tabular-nums`}
                  />
                  <span data-error="height" className="mt-1 block min-h-[1rem] text-xs text-danger">{err?.heightCm ?? ""}</span>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-text-3">Height {HEIGHT_MIN_CM}-{HEIGHT_MAX_CM} cm. Leave a field empty to keep the current value.</p>
      <button type="submit" disabled={pending} className="min-h-[44px] w-full rounded-md bg-brand-400 px-4 text-sm font-semibold text-ink-900 disabled:opacity-60">
        {pending ? "Saving..." : "Save squad"}
      </button>
    </form>
  );
}
