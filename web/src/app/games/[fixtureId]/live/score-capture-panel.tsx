import { SubmitButton } from "@/app/components/submit-button";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";
import { type ShootoutKick, type ShootoutSide } from "@/lib/sports/shootout";
import type { SportDefinition } from "@/lib/sports/types";
import { recordScoringEvent, recordShootoutKick } from "../../actions";

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
  innings,
  knockout = false,
  scoresLevel = false,
  shootoutKicks = [],
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

  const actionButtons = (teamId: string) => (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((action) => (
        <form key={action.label} action={recordScoringEvent.bind(null, gameId, fixtureId)}>
          <input type="hidden" name="seasonClubId" value={teamId} />
          <input type="hidden" name="typeKey" value={action.typeKey} />
          {action.runs !== undefined ? <input type="hidden" name="runs" value={action.runs} /> : null}
          {action.points !== undefined ? <input type="hidden" name="points" value={action.points} /> : null}
          <SubmitButton pendingLabel="…" className={`${BIG_BTN} border border-emerald-400/30 px-4 text-xs text-emerald-300`}>
            {action.label}
          </SubmitButton>
        </form>
      ))}
    </div>
  );

  const supportsShootout = definition.capabilities.includes("PENALTIES");
  const shootoutSection =
    knockout && supportsShootout && teams.length === 2 ? (
      <section className="mt-6 rounded-2xl border border-amber-400/20 bg-[#0b100e] p-5">
        <h3 className="font-semibold">Penalty shootout</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
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
              <div key={team.id} className="rounded-xl border border-white/[.06] p-4">
                <h4 className="text-sm font-semibold">{team.name}</h4>
                <p className="mt-1 text-xs text-zinc-500">
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
                          className={`${BIG_BTN} border px-4 text-xs ${scoredKick ? "border-emerald-400/30 text-emerald-300" : "border-rose-400/30 text-rose-300"}`}
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
      <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          {batting ? `${batting.name} batting.` : "Batting side unknown."} Runs are credited to the batting team for the current innings.
        </p>
        {innings ? (
          <p className="mt-2 text-sm text-zinc-300">
            Innings {innings.period} · {innings.overs} overs · {innings.wickets} wicket{innings.wickets === 1 ? "" : "s"}
            {innings.target !== null ? <span className="ml-2 text-amber-300">Target {innings.target}</span> : null}
          </p>
        ) : null}
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
      {shootoutSection}
    </section>
  );
}
