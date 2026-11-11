"use client";

import { useActionState } from "react";
import { castMvpVoteAction } from "./mvp-actions";
import type { MvpCandidate } from "@/server/mvp/votes";

// Fan MVP voting (streak v12, Prompt 4).
//
// The candidates come from the box score, so this component never invents a name. Voting requires a signed-in fan -
// one vote per person per game - and once someone has voted (or the action says they already did) the buttons are
// replaced by the tally, because showing a disabled button invites a bug report.
export function MvpVoteSection({
  gameId,
  candidates,
  voted,
  signedIn,
}: {
  gameId: string;
  candidates: MvpCandidate[];
  voted: boolean;
  signedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState(castMvpVoteAction, null);
  const hasVoted = voted || state?.ok === true || state?.reason === "ALREADY_VOTED";

  return (
    <section className="mt-8 rounded-lg border border-line bg-ink-800 p-5">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">Vote for MVP</h2>
      <p className="mt-1 text-sm text-text-3">
        {hasVoted
          ? "Your vote is in. The tally below is what the fans have chosen so far."
          : "Pick the performer who decided this game. One vote per fan, and it cannot be changed."}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {candidates.map((candidate) => (
          <div key={candidate.playerId} className="rounded-lg border border-line bg-ink-900 p-4">
            <p className="text-sm font-bold text-text-1">{candidate.name}</p>
            <p className="text-[10px] uppercase tracking-wide text-text-3">{candidate.clubShortName ?? "—"}</p>
            <p className="mt-2 font-mono text-xs text-text-2">
              {candidate.points} PTS · {candidate.rebounds} REB · {candidate.assists} AST
            </p>
            <p className="mt-1 text-xs text-brand-300">{candidate.votes} vote{candidate.votes === 1 ? "" : "s"}</p>
            {!hasVoted ? (
              <form action={formAction} className="mt-3">
                <input type="hidden" name="gameId" value={gameId} />
                <input type="hidden" name="playerId" value={candidate.playerId} />
                <button
                  type="submit"
                  disabled={pending || !signedIn}
                  className="w-full rounded-lg border border-brand-400/40 px-3 py-1.5 text-xs font-bold text-brand-300 disabled:opacity-40"
                >
                  {signedIn ? (pending ? "Voting…" : "Vote") : "Sign in to vote"}
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>

      {state && !state.ok && state.reason !== "ALREADY_VOTED" ? (
        <p className="mt-3 text-xs text-danger">
          {state.reason === "NOT_FINAL" ? "This game is not final yet." : state.reason === "NOT_A_CANDIDATE" ? "That player is not one of this game's candidates." : "Something went wrong."}
        </p>
      ) : null}
    </section>
  );
}
