import type { Prisma } from "@/generated/prisma/client";
import { competitiveFixtureScope } from "@/lib/competitive-scope";

type FinalFixture = {
  homeSeasonClubId: string;
  awaySeasonClubId: string;
  homeScore: number;
  awayScore: number;
  winnerSeasonClubId: string | null;
};

export function calculateStandings(teamIds: string[], fixtures: FinalFixture[]) {
  const rows = new Map(teamIds.map((id) => [id, { played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 }]));
  for (const fixture of fixtures) {
    const home = rows.get(fixture.homeSeasonClubId); const away = rows.get(fixture.awaySeasonClubId);
    if (!home || !away) continue;
    home.played++; away.played++; home.pointsFor += fixture.homeScore; home.pointsAgainst += fixture.awayScore;
    away.pointsFor += fixture.awayScore; away.pointsAgainst += fixture.homeScore;
    if (fixture.winnerSeasonClubId === fixture.homeSeasonClubId) { home.won++; away.lost++; }
    else if (fixture.winnerSeasonClubId === fixture.awaySeasonClubId) { away.won++; home.lost++; }
  }
  return new Map([...rows.entries()].map(([id, row]) => [id, {
    ...row,
    pointDifference: row.pointsFor - row.pointsAgainst,
    leaguePoints: row.won * 3,
  }]));
}

export function compareStandings(
  a: { leaguePoints:number; won:number; pointDifference:number; pointsFor:number; name:string },
  b: { leaguePoints:number; won:number; pointDifference:number; pointsFor:number; name:string },
) {
  return b.leaguePoints-a.leaguePoints || b.won-a.won || b.pointDifference-a.pointDifference ||
    b.pointsFor-a.pointsFor || a.name.localeCompare(b.name);
}

// Phase 1 Stage 5.2C: organizationId is now an explicit required parameter, stamped on the
// upsert's create branch. Previously omitted entirely - a genuine gap, since Prisma's
// dbgenerated() default for a brand-new Standing row (created here the first time a season's
// results are finalized) resolves to the Stage 3a Neon Ultra default, not necessarily the
// calling organization. Under RLS this would have surfaced as a hard "new row violates row-level
// security policy" failure for a second organization's first standings recalculation (the same
// failure mode PublicIdCounter hit in Stage 5.2B-1/5.4A), not a silent cross-tenant write - but
// it is still a defect, fixed the same way every other stage's upsert.create gap has been.
export async function recalculateStandings(tx: Prisma.TransactionClient, organizationId: string, seasonId: string) {
  const [teams, fixtures] = await Promise.all([
    tx.seasonClub.findMany({ where: { seasonId }, select: { id: true } }),
    tx.fixture.findMany({
      where: { seasonId, status: "FINAL", ...competitiveFixtureScope() },
      select: {
        homeSeasonClubId: true,
        awaySeasonClubId: true,
        homeScore: true,
        awayScore: true,
        winnerSeasonClubId: true,
      },
    }),
  ]);
  const rows = calculateStandings(teams.map((team) => team.id), fixtures);
  await Promise.all([...rows.entries()].map(([seasonClubId, row]) => tx.standing.upsert({
    where: { seasonClubId },
    create: { organizationId, seasonId, seasonClubId, ...row },
    update: row,
  })));
}
