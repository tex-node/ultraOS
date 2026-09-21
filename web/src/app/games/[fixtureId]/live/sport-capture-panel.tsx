import { SubmitButton } from "@/app/components/submit-button";
import { BASKETBALL_STAT_PANEL_KEYS, nonScoringCapturePlan } from "@/lib/sports/capture-plan";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";
import type { SportDefinition } from "@/lib/sports/types";
import { recordSportEvent } from "../../actions";

type TeamOption = {
  id: string;
  name: string;
  players: { id: string; name: string }[];
};

const BIG_BTN = "min-h-[56px] min-w-[56px] rounded-md px-4 font-display text-base font-bold active:scale-95 transition";

// Catalog-driven capture for the sport's NON-scoring events (cards, fouls, substitutions, serves...)
// grouped by category. Scoring is deliberately excluded: it is recorded through the panel that
// actually changes the scoreline (the sport's scoring module, or basketball's dedicated scorer).
// Showing a "Goal" button here would record a note that does not count.
export function SportCapturePanel({
  gameId,
  fixtureId,
  definition,
  teams,
}: {
  gameId: string;
  fixtureId: string;
  definition: SportDefinition;
  teams: TeamOption[];
}) {
  // Basketball scores through recordScore, every other sport through its scoring module.
  const scoringHandledElsewhere = definition.key === "BASKETBALL" || resolveScoringModule(definition) !== null;
  const plan = nonScoringCapturePlan(definition, {
    scoringHandledElsewhere,
    // Basketball's dedicated stat panel already owns these, with player attribution.
    excludeKeys: definition.key === "BASKETBALL" ? BASKETBALL_STAT_PANEL_KEYS : [],
  });

  return (
    <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Sport capture · {definition.name}</h3>
        <p className="text-xs text-text-3">
          Non-scoring events from the {definition.name} catalog. Points are recorded in the scoring panel above.
        </p>
      </div>

      {plan.length === 0 ? (
        <p className="mt-4 text-sm text-text-3">No non-scoring events for this sport.</p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {teams.map((team) => (
            <form key={team.id} action={recordSportEvent.bind(null, gameId, fixtureId)} className="rounded-md border border-line p-4">
              <input type="hidden" name="seasonClubId" value={team.id} />
              <h4 className="text-sm font-semibold">{team.name}</h4>

              <select name="playerId" className="mt-3 min-h-[48px] w-full rounded-lg bg-white/[.05] p-3">
                <option value="">Team / no player</option>
                {team.players.map((player) => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>

              {plan.map((group) => (
                <div key={group.category} className="mt-3">
                  <p className="text-[10px] uppercase tracking-wider text-text-3">{group.category.replace(/_/g, " ")}</p>
                  <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {group.actions.map((action) => (
                      <SubmitButton
                        key={action.key}
                        name="typeKey"
                        value={action.key}
                        pendingLabel="…"
                        className={`${BIG_BTN} w-full border border-line bg-ink-700 text-text-1`}
                      >
                        {action.label}
                      </SubmitButton>
                    ))}
                  </div>
                </div>
              ))}

              <input name="description" placeholder="Note (optional)" className="mt-3 min-h-[44px] w-full rounded-lg bg-white/[.05] p-3 text-sm" />
            </form>
          ))}
        </div>
      )}
    </section>
  );
}
