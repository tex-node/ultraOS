import { SubmitButton } from "@/app/components/submit-button";
import { capturePlan } from "@/lib/sports/capture-plan";
import type { SportDefinition } from "@/lib/sports/types";
import { recordSportEvent } from "../../actions";

type TeamOption = {
  id: string;
  name: string;
  players: { id: string; name: string }[];
};

const BIG_BTN = "min-h-[52px] min-w-[52px] rounded-xl text-sm font-semibold active:scale-95 transition";

// Catalog-driven capture: renders the selected sport's events (grouped by category) so the same
// console works for any sport, with only the buttons changing. Basketball keeps its dedicated
// scoring panels for points; this panel records the sport's non-scoring/structured events.
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
  const plan = capturePlan(definition);
  const hasScoring = plan.some((group) => group.actions.some((action) => action.scores));

  return (
    <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Sport capture · {definition.name}</h3>
        <p className="text-xs text-zinc-500">Events come from the {definition.name} catalog.</p>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {teams.map((team) => (
          <form key={team.id} action={recordSportEvent.bind(null, gameId, fixtureId)} className="rounded-xl border border-white/[.06] p-4">
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
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">{group.category.replace(/_/g, " ")}</p>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {group.actions.map((action) => (
                    <SubmitButton
                      key={action.key}
                      name="typeKey"
                      value={action.key}
                      pendingLabel="…"
                      className={`${BIG_BTN} border border-emerald-400/30 text-xs text-emerald-300`}
                    >
                      {action.label}
                    </SubmitButton>
                  ))}
                </div>
              </div>
            ))}

            {hasScoring ? (
              <label className="mt-3 block text-xs text-zinc-500">
                Points override (scoring events; blank uses the sport default)
                <input name="points" type="number" min="1" placeholder="default" className="mt-1 min-h-[44px] w-full rounded-lg bg-white/[.05] p-3 text-sm" />
              </label>
            ) : null}
            <input name="description" placeholder="Note (optional)" className="mt-2 min-h-[44px] w-full rounded-lg bg-white/[.05] p-3 text-sm" />
          </form>
        ))}
      </div>
    </section>
  );
}
