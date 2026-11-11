"use client";

import { useActionState } from "react";
import type { AdoptPlanState } from "../[seasonClubId]/players/[playerId]/actions";
import type { AdoptedCoachingPlan } from "@/server/coaching/plans";

// The adoption panel under a player's Development Plan (P15 C1 remainder / I2 first slice).
//
// Two states, one component: no plan adopted yet (offer "Adopt this plan"), or a plan already
// adopted (show what was committed to, frozen at adoption time, and offer to supersede it with the
// CURRENT engine output). The number of focus areas and the review window are shown from the
// SNAPSHOT, not from the live plan - that is the point of adopting.
type Action = (state: AdoptPlanState, formData: FormData) => Promise<AdoptPlanState>;

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function PlanAdoptionPanel({
  action,
  adopted,
  planHasFocusAreas,
  planGamesPlayed,
}: {
  action: Action;
  adopted: AdoptedCoachingPlan | null;
  planHasFocusAreas: boolean;
  planGamesPlayed: number;
}) {
  const [state, formAction, pending] = useActionState(action, {} as AdoptPlanState);
  const canAdopt = planHasFocusAreas;

  return (
    <section className="mt-6 rounded-lg border border-line bg-ink-800 p-4" aria-labelledby="adoption-heading">
      <h2 id="adoption-heading" className="text-sm font-semibold uppercase tracking-[.12em] text-text-3">
        Adoption
      </h2>

      {adopted ? (
        <div className="mt-3 rounded-md border border-line-subtle bg-ink-700 p-3">
          <p className="text-sm text-text-1">
            <span className="font-semibold text-brand-300">Adopted plan</span>{" "}
            <span className="text-text-3">
              ({adopted.planVersion}, {dateFormatter.format(adopted.adoptedAt)}
              {adopted.adoptedByName ? `, ${adopted.adoptedByName}` : ""})
            </span>
          </p>
          {adopted.snapshot ? (
            <p className="mt-1 text-xs text-text-2">
              {adopted.snapshot.focusAreas.length} focus area{adopted.snapshot.focusAreas.length === 1 ? "" : "s"}:{" "}
              {adopted.snapshot.focusAreas.map((area) => area.label).join(", ")}
              {adopted.reviewWindowGames > 0 ? ` · review after ${adopted.reviewWindowGames} games` : null}
            </p>
          ) : (
            <p className="mt-1 text-xs text-warn">
              This plan was adopted, but its snapshot cannot be read by this version of the app. The row is intact; do not
              re-adopt unless you intend to replace it.
            </p>
          )}
          {adopted.note ? <p className="mt-2 whitespace-pre-line text-xs text-text-2">{adopted.note}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-text-2">
          No plan adopted yet. Adopting records this plan as the coach&apos;s commitment for the player, so later changes
          to the underlying data do not rewrite it.
        </p>
      )}

      {state.error ? (
        <p role="alert" className="mt-3 rounded-md bg-danger/10 p-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.fieldError ? (
        <p role="alert" className="mt-3 rounded-md bg-danger/10 p-3 text-sm text-danger">
          {state.fieldError}
        </p>
      ) : null}
      {state.adopted ? (
        <p role="status" className="mt-3 rounded-md bg-success/10 p-3 text-sm text-success">
          {state.superseded ? "Plan replaced. The previous plan is kept as superseded history." : "Plan adopted."}
        </p>
      ) : null}

      <form action={formAction} className="mt-3">
        <label htmlFor="adoption-note" className="block text-xs text-text-2">
          Note for the player (optional, shown with the adopted plan)
        </label>
        <input
          id="adoption-note"
          name="note"
          maxLength={500}
          placeholder="e.g. Agreed with the player after review"
          className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm text-text-1 placeholder:text-text-3 focus:border-brand-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canAdopt || pending}
          className="mt-3 min-h-[44px] rounded-md bg-brand-400 px-4 text-sm font-bold text-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : adopted ? "Supersede with the current plan" : "Adopt this plan"}
        </button>
        {!canAdopt ? (
          <p className="mt-2 text-xs text-text-3">
            Not adoptable yet: this plan has no focus areas
            {planGamesPlayed === 0 ? " because no games have been recorded for this player" : " at the current sample size"}.
          </p>
        ) : null}
      </form>
    </section>
  );
}
