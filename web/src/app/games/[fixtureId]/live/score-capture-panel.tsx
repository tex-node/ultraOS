import { SubmitButton } from "@/app/components/submit-button";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";
import { pointLabel } from "@/lib/sports/tennis-scoring";
import { type ShootoutKick, type ShootoutSide } from "@/lib/sports/shootout";
import type { SportDefinition } from "@/lib/sports/types";
import { recordScoringEvent, recordShootoutKick } from "../../actions";

const BIG_BTN = "min-h-[56px] min-w-[56px] rounded-md px-4 font-display text-base font-bold active:scale-95 transition";

// One console panel for every scoring module (sets / goals / runs). Buttons come from the resolved
// module, so the console has no sport-specific branching. Each action is its own form with hidden
// inputs (typeKey, and runs for run sports); cards/errors/timeouts use the catalog panel instead.
export function ScoreCapturePanel({
  gameId,
  fixtureId,
  definition,
  teams,
  battingTeamId,
  innings,
  knockout = false,
  scoresLevel = false,
  shootoutKicks = [],
  currentPeriod,
  periodScores = [],
  tennisPoints,
}: {
  gameId: string;
  fixtureId: string;
  definition: SportDefinition;
  teams: { id: string; name: string }[];
  battingTeamId?: string;
  innings?: { period: number; overs: string; wickets: number; target: number | null };
  knockout?: boolean;
  scoresLevel?: boolean;
  shootoutKicks?: ShootoutKick[];
  currentPeriod?: number;
  periodScores?: { period: number; home: number; away: number }[];
  tennisPoints?: { home: number; away: number };
}) {
  const scoringModule = resolveScoringModule(definition);
  if (!scoringModule) return null;
  const actions = scoringModule.actions(definition);
  const title =
    scoringModule.kind === "SETS"
      ? "Set scoring"
      : scoringModule.kind === "GOALS"
        ? "Goal scoring"
        : scoringModule.kind === "TENNIS"
          ? "Point scoring"
          : scoringModule.kind === "POINTS"
            ? "Scoring"
            : "Run scoring";

  // Live in-period progress: the header scoreboard only shows sets won, so surface the current
  // set's rally score (SETS sports) or the current game's points (tennis) — otherwise every tap
  // looks like it did nothing until a full set or game completes.
  const currentRow = currentPeriod !== undefined ? periodScores.find((row) => row.period === currentPeriod) : undefined;
  const progressSummary =
    scoringModule.kind === "SETS" && currentPeriod !== undefined ? (
      <p className="mt-1 text-sm font-semibold text-brand-300">
        Set {currentPeriod}: {currentRow?.home ?? 0}–{currentRow?.away ?? 0}
      </p>
    ) : scoringModule.kind === "TENNIS" && currentPeriod !== undefined ? (
      <p className="mt-1 text-sm font-semibold text-brand-300">
        Set {currentPeriod}: games {currentRow?.home ?? 0}–{currentRow?.away ?? 0}
        {" · "}points {pointLabel(tennisPoints ?? { home: 0, away: 0 }, "HOME")}–
        {pointLabel(tennisPoints ?? { home: 0, away: 0 }, "AWAY")}
      </p>
    ) : null;

  const actionButtons = (teamId: string) => (    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((action) => (
        <form key={action.label} action={recordScoringEvent.bind(null, gameId, fixtureId)}>
          <input type="hidden" name="seasonClubId" value={teamId} />
          <input type="hidden" name="typeKey" value={action.typeKey} />
          {action.runs !== undefined ? <input type="hidden" name="runs" value={action.runs} /> : null}
          {action.points !== undefined ? <input type="hidden" name="points" value={action.points} /> : null}
          <SubmitButton pendingLabel="…" className={`${BIG_BTN} border border-brand-400/30 px-4 text-xs text-brand-300`}>
            {action.label}
          </SubmitButton>
        </form>
      ))}
    </div>
  );

  const supportsShootout = definition.capabilities.includes("PENALTIES");
  const shootoutSection =
    knockout && supportsShootout && teams.length === 2 ? (
      <section className="mt-6 rounded-lg border border-warn/20 bg-ink-800 p-5">
        <h3 className="font-semibold">Penalty shootout</h3>
        <p className="mt-0.5 text-xs text-text-3">
          {scoresLevel
            ? "Level after normal time — record each kick. Best-of-five, then sudden death; the winner is decided automatically."
            : "Available once the match is level after normal time and extra time."}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {teams.map((team, index) => {
            const side: ShootoutSide = index === 0 ? "HOME" : "AWAY";
            const taken = shootoutKicks.filter((kick) => kick.side === side);
            const scored = taken.filter((kick) => kick.scored).length;
            return (
              <div key={team.id} className="rounded-md border border-line p-4">
                <h4 className="text-sm font-semibold">{team.name}</h4>
                <p className="mt-1 text-xs text-text-3">
                  {scored}/{taken.length} in the shootout
                </p>
                {scoresLevel ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[true, false].map((scoredKick) => (
                      <form key={String(scoredKick)} action={recordShootoutKick.bind(null, gameId, fixtureId)}>
                        <input type="hidden" name="side" value={side} />
                        <input type="hidden" name="scored" value={scoredKick ? "true" : "false"} />
                        <SubmitButton
                          pendingLabel="…"
                          className={`${BIG_BTN} border px-4 text-xs ${scoredKick ? "border-brand-400/30 text-brand-300" : "border-danger/30 text-danger"}`}
                        >
                          {scoredKick ? "Scored" : "Missed"}
                        </SubmitButton>
                      </form>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    ) : null;

  if (scoringModule.kind === "RUNS") {
    const batting = teams.find((team) => team.id === battingTeamId);
    return (
      <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-text-3">
          {batting ? `${batting.name} batting.` : "Batting side unknown."} Runs are credited to the batting team for the current innings.
        </p>
        {innings ? (
          <p className="mt-2 text-sm text-text-1">
            Innings {innings.period} · {innings.overs} overs · {innings.wickets} wicket{innings.wickets === 1 ? "" : "s"}
            {innings.target !== null ? <span className="ml-2 text-warn">Target {innings.target}</span> : null}
          </p>
        ) : null}
        {batting ? <div className="rounded-md border border-line p-4">{actionButtons(batting.id)}</div> : null}
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5">
      <h3 className="font-semibold">{title}</h3>
      {progressSummary}
      {scoringModule.kind === "GOALS" ? <p className="mt-0.5 text-xs text-text-3">An own goal credits the other team.</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {teams.map((team) => (
          <div key={team.id} className="rounded-md border border-line p-4">
            <h4 className="text-sm font-semibold">{team.name}</h4>
            {actionButtons(team.id)}
          </div>
        ))}
      </div>
      {shootoutSection}
    </section>
  );
}
