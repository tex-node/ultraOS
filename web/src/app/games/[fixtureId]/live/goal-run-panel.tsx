import { SubmitButton } from "@/app/components/submit-button";
import { recordGoal, recordRuns } from "../../actions";

const BIG_BTN = "min-h-[52px] min-w-[52px] rounded-xl text-sm font-semibold active:scale-95 transition";

// Specialised scoring for goal sports (football) and run sports (cricket). Cards/extras/wickets
// beyond the run value remain available via the catalog capture panel.
export function GoalRunPanel({
  gameId,
  fixtureId,
  unit,
  teams,
  battingTeamId,
}: {
  gameId: string;
  fixtureId: string;
  unit: "goal" | "run";
  teams: { id: string; name: string }[];
  battingTeamId?: string;
}) {
  if (unit === "goal") {
    return (
      <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <h3 className="font-semibold">Goal scoring</h3>
        <p className="mt-0.5 text-xs text-zinc-500">An own goal credits the other team.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {teams.map((team) => (
            <form key={team.id} action={recordGoal.bind(null, gameId, fixtureId)} className="rounded-xl border border-white/[.06] p-4">
              <input type="hidden" name="seasonClubId" value={team.id} />
              <h4 className="text-sm font-semibold">{team.name}</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                <SubmitButton name="typeKey" value="GOAL" pendingLabel="…" className={`${BIG_BTN} bg-emerald-400 px-4 text-zinc-950`}>Goal</SubmitButton>
                <SubmitButton name="typeKey" value="PENALTY_GOAL" pendingLabel="…" className={`${BIG_BTN} border border-emerald-400/30 px-4 text-emerald-300`}>Penalty</SubmitButton>
                <SubmitButton name="typeKey" value="OWN_GOAL" pendingLabel="…" className={`${BIG_BTN} border border-rose-400/30 px-4 text-rose-300`}>Own goal</SubmitButton>
              </div>
            </form>
          ))}
        </div>
      </section>
    );
  }

  const batting = teams.find((team) => team.id === battingTeamId);
  return (
    <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <h3 className="font-semibold">Run scoring</h3>
      <p className="mt-0.5 text-xs text-zinc-500">
        {batting ? `${batting.name} batting.` : "Batting side unknown."} Runs are credited to the batting team for the current innings.
      </p>
      {batting ? (
        <form action={recordRuns.bind(null, gameId, fixtureId)} className="mt-4">
          <input type="hidden" name="seasonClubId" value={batting.id} />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4, 6].map((runs) => (
              <SubmitButton key={runs} name="runs" value={runs} pendingLabel="…" className={`${BIG_BTN} border border-emerald-400/30 px-4 text-emerald-300`}>
                {runs === 0 ? "Dot" : `+${runs}`}
              </SubmitButton>
            ))}
            <SubmitButton name="typeKey" value="WICKET" pendingLabel="…" className={`${BIG_BTN} border border-rose-400/30 px-4 text-rose-300`}>Wicket</SubmitButton>
          </div>
        </form>
      ) : null}
    </section>
  );
}
