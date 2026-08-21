import { prisma } from "../src/lib/prisma";

async function main() {
  const [finalFixtures, playerStatCount, teamStatCount, playerCount, staffCount, clubCount, seasonClubCount, standingCount, capabilityGroups, statSourceGroups] = await Promise.all([
    prisma.fixture.count({ where: { status: "FINAL" } }),
    prisma.playerStat.count(),
    prisma.teamStat.count(),
    prisma.player.count(),
    prisma.staff.count(),
    prisma.club.count(),
    prisma.seasonClub.count(),
    prisma.standing.count(),
    prisma.game.groupBy({ by: ["dataCapability"], _count: true }),
    prisma.game.groupBy({ by: ["statSource"], _count: true }),
  ]);
  console.log(JSON.stringify({ finalFixtures, playerStatCount, teamStatCount, playerCount, staffCount, clubCount, seasonClubCount, standingCount, capabilityGroups, statSourceGroups }, null, 2));
}

main().finally(() => prisma.$disconnect());
