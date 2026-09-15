import { SubmitButton } from "@/app/components/submit-button";
import { evaluateSets, setTargetPoints, type SetPoints, type SetScoringConfig } from "@/lib/sports/set-scoring";
import { recordSetPoint } from "../../actions";

const BIG_BTN = "min-h-[56px] min-w-[56px] rounded-xl text-base font-bold active:scale-95 transition";

// Volleyball set scoring: +1 rally point for a side, with the per-set scoreline and a running
// sets-won tally. The capture action resolves set winners and auto-finalizes the match.
export function SetScorePanel({
  gameId,
  fixtureId,
  config,
  sets,
  currentPeriod,
  teams,
}: {
  gameId: string;
  fixtureId: string;
  config: SetScoringConfig;
  sets: SetPoints[];
  currentPeriod: number;
  teams: { id: string; name: string }[];
}) {
  const summary = evaluateSets(config, sets);
  const target = setTargetPoints(config, currentPeriod);
  const currentSet = sets.find((set) => set.period === currentPeriod);

  return (
    <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Set scoring</h3>
        <p className="text-xs text-zinc-500">
          First to {config.periodsToWin} sets · set {currentPeriod} target {target} (win by {config.winBy})
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {summary.sets.map((set) => (
          <span
            key={set.period}
            className={`rounded-lg border px-3 py-1 ${set.complete ? "border-emerald-400/40 text-emerald-200" : "border-white/10 text-zinc-300"}`}
          >
            S{set.period} {set.home}–{set.away}
            {set.winner ? <span className="ml-1 text-xs">{set.winner === "HOME" ? "◀" : "▶"}</span> : null}
          </span>
        ))}
        {summary.sets.length === 0 ? <span className="text-zinc-500">No sets played yet.</span> : null}
      </div>

      <p className="mt-3 text-sm text-zinc-300">
        Sets won: <span className="font-semibold text-white">{summary.homeSetsWon}</span> – <span className="font-semibold text-white">{summary.awaySetsWon}</span>
        {currentSet ? <span className="ml-3 text-zinc-500">Current set: {currentSet.home}–{currentSet.away}</span> : null}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {teams.map((team) => (
          <form key={team.id} action={recordSetPoint.bind(null, gameId, fixtureId)} className="rounded-xl border border-white/[.06] p-4">
            <input type="hidden" name="seasonClubId" value={team.id} />
            <h4 className="text-sm font-semibold">{team.name}</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["RALLY_POINT", "ACE", "KILL", "BLOCK"] as const).map((typeKey) => (
                <SubmitButton key={typeKey} name="typeKey" value={typeKey} pendingLabel="…" className={`${BIG_BTN} border border-emerald-400/30 px-4 text-xs text-emerald-300`}>
                  +1 {typeKey === "RALLY_POINT" ? "Point" : typeKey}
                </SubmitButton>
              ))}
            </div>
          </form>
        ))}
      </div>
    </section>
  );
}
