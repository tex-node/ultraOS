import { OperationsShell } from "@/app/components/operations-shell";
import { DataTable } from "@/app/components/ui/table";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Prisma } from "@/generated/prisma/client";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { getSportDefinition } from "@/lib/sports/registry";
import { formatRaceTime } from "@/lib/sports/timed-standings";
import { withOrganizationContext } from "@/lib/tenant-context";
import { loadSeasonTimedLeaderboard } from "@/server/timed/timed-console";

export default async function Standings() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/standings");
  }
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const season = await withOrganizationContext(session.user.organizationId, (tx) => tx.season.findFirst({
    where: { status: "ACTIVE" },
    include: {
      competition: { include: { sport: { select: { slug: true } } } },
      standings: { include: { seasonClub: { include: { club: true, division: true } } } },
    },
  }));
  const divisions = groupByDivision(season?.standings ?? []);

  // A timed sport has no league table (streak v12): a flag race is decided by the clock, so it renders a race
  // leaderboard ordered by best time instead of a W/L table of zeroes.
  const sportDefinition = season ? getSportDefinition(season.competition.sport.slug) : null;
  if (season && sportDefinition?.scoring.winCondition === "LOWEST_TIME") {
    const rows = await loadSeasonTimedLeaderboard(session.user.organizationId, season.id);
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-xs uppercase tracking-[.2em] text-brand-400">{season.name}</p>
          <h1 className="mt-2 font-display text-3xl font-bold">Race results</h1>
          <p className="mt-1 text-sm text-text-3">
            Fastest recorded time wins. A competitor&apos;s best time counts once, however many heats they ran.
          </p>
          {rows.length === 0 ? (
            <p className="mt-6 rounded-lg border border-line bg-ink-800 p-4 text-sm text-text-2">No finish times recorded yet.</p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-text-3">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Competitor</th>
                    <th className="py-2 pr-3 text-right">Time</th>
                    <th className="py-2 pr-3 text-right">Gap</th>
                    <th className="py-2 text-right">Finishes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-line/60">
                      <td className="py-2 pr-3 text-text-3">{row.rank}</td>
                      <td className="py-2 pr-3 font-semibold text-text-1">{row.name}</td>
                      <td className="py-2 pr-3 text-right font-mono">{formatRaceTime(row.seconds)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-text-3">{row.gapSeconds === 0 ? "—" : `+${row.gapSeconds.toFixed(2)}`}</td>
                      <td className="py-2 text-right text-text-3">{row.finishes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </OperationsShell>
    );
  }

  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10">
    <p className="text-xs uppercase tracking-[.2em] text-brand-400">{season?.name ?? "No active season"}</p>
    <h1 className="mt-2 font-display text-3xl font-bold">League tables</h1>
    {[...divisions.entries()].map(([division, unsorted]) => {
      const rows = sortRows(unsorted);
      return <section key={division} className="mt-8"><h2 className="mb-4 text-xl font-semibold">{division}</h2>
        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.id}
          minWidth="850px"
          columns={[
            { key: "pos", label: "#", render: (_r, i) => i + 1 },
            { key: "team", label: "SeasonClub", render: (r) => r.seasonClub!.club.name },
            { key: "played", label: "P", align: "right", render: (r) => r.played },
            { key: "won", label: "W", align: "right", render: (r) => r.won },
            { key: "lost", label: "L", align: "right", render: (r) => r.lost },
            { key: "pf", label: "PF", align: "right", render: (r) => r.pointsFor },
            { key: "pa", label: "PA", align: "right", render: (r) => r.pointsAgainst },
            { key: "pd", label: "PD", align: "right", render: (r) => r.pointDifference },
            { key: "pts", label: "PTS", align: "right", render: (r) => <b className="text-brand-400">{r.leaguePoints}</b> },
          ]}
        />
      </section>;
    })}
  </main></OperationsShell>;
}

type Row = Prisma.StandingGetPayload<{ include: { seasonClub: { include: { club: true; division: true } } } }>;
function groupByDivision(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const division = row.seasonClub!.division.name;
    groups.set(division, [...(groups.get(division) ?? []), row]);
  }
  return groups;
}
function sortRows(rows: Row[]) { return [...rows].sort((a,b)=>b.leaguePoints-a.leaguePoints||b.won-a.won||b.pointDifference-a.pointDifference||b.pointsFor-a.pointsFor||a.seasonClub!.club.name.localeCompare(b.seasonClub!.club.name)); }
