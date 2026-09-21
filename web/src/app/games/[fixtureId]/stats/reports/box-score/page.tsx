import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  MissingOrganizationContextError,
  requireFixturePermissionOrRedirect,
} from "@/lib/authorization";
import { getGameLiveBoxScore } from "@/app/games/stats-actions";
import { emptyPlayerStats, type DerivedPlayerStats } from "@/lib/event-derived-stats";
import { formatMinutes, verifyTeamMinutes, type SubstitutionWithClock } from "@/lib/lineup-stints";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

function statLine(stats: DerivedPlayerStats, minutes: string) {
  return {
    minutes,
    points: stats.points,
    fg: `${stats.fieldGoalsMade}-${stats.fieldGoalsAttempted}`,
    three: `${stats.threePointsMade}-${stats.threePointsAttempted}`,
    ft: `${stats.freeThrowsMade}-${stats.freeThrowsAttempted}`,
    oreb: stats.offensiveRebounds,
    dreb: stats.defensiveRebounds,
    reb: stats.rebounds,
    ast: stats.assists,
    stl: stats.steals,
    blk: stats.blocks,
    to: stats.turnovers,
    pf: stats.fouls,
  };
}

// Traditional box score, derived live from the statistician ledger (never the materialized
// PlayerStat rows, so voided and corrected events are reflected immediately).
export default async function BoxScoreReport({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const { session } = await requireFixturePermissionOrRedirect(
    "game:record-stats",
    fixtureId,
    `/games/${fixtureId}/stats/reports/box-score`,
  );
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const fixture = await withOrganizationContext(organizationId, (tx) =>
    tx.fixture.findUnique({
      where: { id: fixtureId },
      include: {
        homeSeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
        awaySeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
        game: true,
      },
    }),
  );
  if (!fixture || !fixture.homeSeasonClub || !fixture.awaySeasonClub) notFound();
  const game = fixture.game;

  const boxScore = game ? await getGameLiveBoxScore(game.id) : null;
  const playerStats = new Map((boxScore?.players ?? []).map((row) => [row.playerId, row]));

  // Minutes come from stints (starters + substitutions), exactly like the stats console.
  const minutesByPlayer = new Map<string, number>();
  if (game) {
    const [starterRows, substitutionRows] = await withOrganizationContext(organizationId, (tx) =>
      Promise.all([
        tx.gameStarter.findMany({ where: { gameId: game.id }, select: { seasonClubId: true, playerId: true } }),
        tx.gameEvent.findMany({
          where: { gameId: game.id, eventType: "SUBSTITUTION", status: "ACTIVE" },
          orderBy: { sequenceNumber: "asc" },
          select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true, period: true, clockSeconds: true },
        }),
      ]),
    );
    const substitutionsWithClock: SubstitutionWithClock[] = substitutionRows
      .filter(
        (s): s is typeof s & { seasonClubId: string; playerId: string; substitutedOutPlayerId: string; sequenceNumber: number } =>
          Boolean(s.seasonClubId && s.playerId && s.substitutedOutPlayerId && s.sequenceNumber !== null),
      )
      .map((s) => ({ seasonClubId: s.seasonClubId, playerInId: s.playerId, playerOutId: s.substitutedOutPlayerId, sequenceNumber: s.sequenceNumber, period: s.period, clockSeconds: s.clockSeconds }));
    const gameEndPoint = { period: game.currentPeriod, clockSeconds: game.clockSecondsRemaining };
    for (const seasonClubId of [fixture.homeSeasonClub.id, fixture.awaySeasonClub.id]) {
      const result = verifyTeamMinutes(seasonClubId, starterRows, substitutionsWithClock, gameEndPoint);
      for (const [playerId, seconds] of result.playerSeconds) minutesByPlayer.set(playerId, seconds);
    }
  }

  const teams = [fixture.homeSeasonClub, fixture.awaySeasonClub];
  const homeClubId = fixture.homeSeasonClub.id;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 py-3">
          <Link href={`/games/${fixtureId}/stats/live`} className="text-sm text-text-2">Back to live console</Link>
          <p className="text-sm text-text-3">
            {fixture.homeScore} - {fixture.awayScore}
            {game ? ` � ${game.status}` : ""}
          </p>
        </div>
        <h1 className="text-2xl font-semibold">
          Box score � {fixture.homeSeasonClub.club.name} vs {fixture.awaySeasonClub.club.name}
        </h1>
        {!boxScore ? (
          <p className="mt-4 text-sm text-text-2">No statistician events recorded yet.</p>
        ) : (
          teams.map((team) => {
            const totals =
              team.id === homeClubId ? boxScore.teams.home : boxScore.teams.away;
            const rows = team.players
              .map((player) => ({
                name: `${player.athlete.firstName} ${player.athlete.lastName}`,
                line: statLine(
                  playerStats.get(player.id) ?? emptyPlayerStats(player.id, team.id),
                  formatMinutes(minutesByPlayer.get(player.id) ?? 0),
                ),
              }))
              .sort((a, b) => b.line.points - a.line.points);
            return (
              <section key={team.id} className="mt-6 overflow-x-auto rounded-lg border border-line bg-ink-800 p-5">
                <h2 className="font-semibold">{team.club.name}</h2>
                <table className="mt-3 w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-text-3">
                    <tr>
                      <th className="py-2 pr-3">Player</th>
                      <th className="py-2 pr-3">MIN</th>
                      <th className="py-2 pr-3">PTS</th>
                      <th className="py-2 pr-3">FG</th>
                      <th className="py-2 pr-3">3P</th>
                      <th className="py-2 pr-3">FT</th>
                      <th className="py-2 pr-3">OREB</th>
                      <th className="py-2 pr-3">DREB</th>
                      <th className="py-2 pr-3">REB</th>
                      <th className="py-2 pr-3">AST</th>
                      <th className="py-2 pr-3">STL</th>
                      <th className="py-2 pr-3">BLK</th>
                      <th className="py-2 pr-3">TO</th>
                      <th className="py-2 pr-3">PF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.name} className="border-t border-white/5">
                        <td className="py-2 pr-3 font-medium">{row.name}</td>
                        <td className="py-2 pr-3">{row.line.minutes}</td>
                        <td className="py-2 pr-3 font-semibold">{row.line.points}</td>
                        <td className="py-2 pr-3">{row.line.fg}</td>
                        <td className="py-2 pr-3">{row.line.three}</td>
                        <td className="py-2 pr-3">{row.line.ft}</td>
                        <td className="py-2 pr-3">{row.line.oreb}</td>
                        <td className="py-2 pr-3">{row.line.dreb}</td>
                        <td className="py-2 pr-3">{row.line.reb}</td>
                        <td className="py-2 pr-3">{row.line.ast}</td>
                        <td className="py-2 pr-3">{row.line.stl}</td>
                        <td className="py-2 pr-3">{row.line.blk}</td>
                        <td className="py-2 pr-3">{row.line.to}</td>
                        <td className="py-2 pr-3">{row.line.pf}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-line font-semibold">
                      <td className="py-2 pr-3">Team</td>
                      <td className="py-2 pr-3">-</td>
                      <td className="py-2 pr-3">{totals.points}</td>
                      <td className="py-2 pr-3">{totals.fieldGoalsMade}-{totals.fieldGoalsAttempted}</td>
                      <td className="py-2 pr-3">{totals.threePointsMade}-{totals.threePointsAttempted}</td>
                      <td className="py-2 pr-3">{totals.freeThrowsMade}-{totals.freeThrowsAttempted}</td>
                      <td className="py-2 pr-3">{totals.offensiveRebounds}</td>
                      <td className="py-2 pr-3">{totals.defensiveRebounds}</td>
                      <td className="py-2 pr-3">{totals.rebounds}</td>
                      <td className="py-2 pr-3">{totals.assists}</td>
                      <td className="py-2 pr-3">-</td>
                      <td className="py-2 pr-3">-</td>
                      <td className="py-2 pr-3">{totals.turnovers}</td>
                      <td className="py-2 pr-3">{totals.fouls}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            );
          })
        )}
      </main>
    </OperationsShell>
  );
}