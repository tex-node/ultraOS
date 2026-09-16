import { prisma } from "../src/lib/prisma";

async function main() {
  const fixtures = await prisma.fixture.findMany({
    where: { status: "FINAL" },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true, homeScore: true, awayScore: true, winnerSeasonClubId: true, status: true,
      game: { select: { statSource: true, dataCapability: true, periodScores: { select: { label: true, homeScore: true, awayScore: true }, orderBy: { period: "asc" } } } },
    },
  });

  const standings = await prisma.standing.findMany({
    orderBy: [{ seasonClubId: "asc" }],
    select: { seasonClubId: true, won: true, lost: true, leaguePoints: true, pointsFor: true, pointsAgainst: true },
  });

  const [playerCount, applicationCount, staffCount, seasonClubCount, playerWithClubCount] = await Promise.all([
    prisma.player.count(),
    prisma.application.count(),
    prisma.staff.count(),
    prisma.seasonClub!.count(),
    prisma.player.count({ where: { seasonClubId: { not: null } } }),
  ]);

  const snapshot = { fixtures, standings, counts: { playerCount, applicationCount, staffCount, seasonClubCount, playerWithClubCount } };
  console.log(JSON.stringify(snapshot, null, 2));
}

main().finally(() => prisma.$disconnect());
