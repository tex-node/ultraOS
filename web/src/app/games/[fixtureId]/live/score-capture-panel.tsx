import { SubmitButton } from "@/app/components/submit-button";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";
import type { SportDefinition } from "@/lib/sports/types";
import { recordScoringEvent } from "../../actions";

const BIG_BTN = "min-h-[52px] min-w-[52px] rounded-xl text-sm font-semibold active:scale-95 transition";

// One console panel for every scoring module (sets / goals / runs). Buttons come from the resolved
// module, so the console has no sport-specific branching. Each action is its own form with hidden
// inputs (typeKey, and runs for run sports); cards/errors/timeouts use the catalog panel instead.
export function ScoreCapturePanel({
  gameId,
  fixtureId,
  definition,
  teams,
  battingTeamId,
}: {
  gameId: string;
  fixtureId: string;
  definition: SportDefinition;
  teams: { id: string; name: string }[];
  battingTeamId?: string;
}) {
  const scoringModule = resolveScoringModule(definition);
  if (!scoringModule) return null;
  const actions = scoringModule.actions(definition);
  const title = scoringModule.kind === "SETS" ? "Set scoring" : scoringModule.kind === "GOALS" ? "Goal scoring" : "Run scoring";

  const actionButtons = (teamId: string) => (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((action) => (
        <form key={action.label} action={recordScoringEvent.bind(null, gameId, fixtureId)}>
          <input type="hidden" name="seasonClubId" value={teamId} />
          <input type="hidden" name="typeKey" value={action.typeKey} />
          {action.runs !== undefined ? <input type="hidden" name="runs" value={action.runs} /> : null}
          <SubmitButton pendingLabel="…" className={`${BIG_BTN} border border-emerald-400/30 px-4 text-xs text-emerald-300`}>
            {action.label}
          </SubmitButton>
        </form>
      ))}
    </div>
  );

  if (scoringModule.kind === "RUNS") {
    const batting = teams.find((team) => team.id === battingTeamId);
    return (
      <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          {batting ? `${batting.name} batting.` : "Batting side unknown."} Runs are credited to the batting team for the current innings.
        </p>
        {batting ? <div className="rounded-xl border border-white/[.06] p-4">{actionButtons(batting.id)}</div> : null}
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <h3 className="font-semibold">{title}</h3>
      {scoringModule.kind === "GOALS" ? <p className="mt-0.5 text-xs text-zinc-500">An own goal credits the other team.</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {teams.map((team) => (
          <div key={team.id} className="rounded-xl border border-white/[.06] p-4">
            <h4 className="text-sm font-semibold">{team.name}</h4>
            {actionButtons(team.id)}
          </div>
        ))}
      </div>
    </section>
  );
}
