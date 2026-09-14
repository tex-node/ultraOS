// Multi-sport Stage 2 (S2.4): read-only parity check for the Entrant abstraction.
//
// Verifies the exit criteria for Gate G2:
//   * every SeasonClub has exactly one TEAM Entrant;
//   * every populated entrant reference on Fixture/GameEvent/Standing/TeamStat resolves back to
//     that row's own SeasonClub (i.e. Entrants reproduce the legacy SeasonClub resolution exactly);
//   * entrant type/seasonClub consistency holds (TEAM entrants have a SeasonClub; only TEAM
//     entrants may have one).
//
// Read-only. Exits non-zero if any mismatch is found. Runs through withOrganizationContext so RLS
// applies per organization.
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

type CountRow = { count: bigint | number };

function toNumber(row: CountRow | undefined): number {
  if (!row) return 0;
  return typeof row.count === "bigint" ? Number(row.count) : row.count;
}

async function main() {
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  let problems = 0;

  for (const organization of organizations) {
    const result = await withOrganizationContext(organization.id, async (tx) => {
      const seasonClubs = await tx.seasonClub.count({ where: { organizationId: organization.id } });
      const teamEntrants = await tx.entrant.count({ where: { organizationId: organization.id, type: "TEAM" } });
      const teamEntrantsWithoutSeasonClub = await tx.entrant.count({
        where: { organizationId: organization.id, type: "TEAM", seasonClubId: null },
      });
      const nonTeamEntrantsWithSeasonClub = await tx.entrant.count({
        where: { organizationId: organization.id, type: { not: "TEAM" }, seasonClubId: { not: null } },
      });

      const fixtureHome = await tx.$queryRaw<CountRow[]>`SELECT count(*)::int AS count FROM "Fixture" f LEFT JOIN "Entrant" e ON e."id" = f."homeEntrantId" WHERE f."organizationId" = ${organization.id} AND (f."homeEntrantId" IS NULL OR e."seasonClubId" IS DISTINCT FROM f."homeSeasonClubId")`;
      const fixtureAway = await tx.$queryRaw<CountRow[]>`SELECT count(*)::int AS count FROM "Fixture" f LEFT JOIN "Entrant" e ON e."id" = f."awayEntrantId" WHERE f."organizationId" = ${organization.id} AND (f."awayEntrantId" IS NULL OR e."seasonClubId" IS DISTINCT FROM f."awaySeasonClubId")`;
      const fixtureWinner = await tx.$queryRaw<CountRow[]>`SELECT count(*)::int AS count FROM "Fixture" f LEFT JOIN "Entrant" e ON e."id" = f."winnerEntrantId" WHERE f."organizationId" = ${organization.id} AND f."winnerSeasonClubId" IS NOT NULL AND (f."winnerEntrantId" IS NULL OR e."seasonClubId" IS DISTINCT FROM f."winnerSeasonClubId")`;
      const events = await tx.$queryRaw<CountRow[]>`SELECT count(*)::int AS count FROM "GameEvent" g LEFT JOIN "Entrant" e ON e."id" = g."entrantId" WHERE g."organizationId" = ${organization.id} AND g."seasonClubId" IS NOT NULL AND (g."entrantId" IS NULL OR e."seasonClubId" IS DISTINCT FROM g."seasonClubId")`;
      const standings = await tx.$queryRaw<CountRow[]>`SELECT count(*)::int AS count FROM "Standing" s LEFT JOIN "Entrant" e ON e."id" = s."entrantId" WHERE s."organizationId" = ${organization.id} AND (s."entrantId" IS NULL OR e."seasonClubId" IS DISTINCT FROM s."seasonClubId")`;
      const teamStats = await tx.$queryRaw<CountRow[]>`SELECT count(*)::int AS count FROM "TeamStat" t LEFT JOIN "Entrant" e ON e."id" = t."entrantId" WHERE t."organizationId" = ${organization.id} AND (t."entrantId" IS NULL OR e."seasonClubId" IS DISTINCT FROM t."seasonClubId")`;

      return {
        seasonClubs,
        teamEntrants,
        teamEntrantsWithoutSeasonClub,
        nonTeamEntrantsWithSeasonClub,
        fixtureHome: toNumber(fixtureHome[0]),
        fixtureAway: toNumber(fixtureAway[0]),
        fixtureWinner: toNumber(fixtureWinner[0]),
        events: toNumber(events[0]),
        standings: toNumber(standings[0]),
        teamStats: toNumber(teamStats[0]),
      };
    });

    const missingEntrants = result.seasonClubs - result.teamEntrants;
    const orgProblems =
      Math.abs(missingEntrants) +
      result.teamEntrantsWithoutSeasonClub +
      result.nonTeamEntrantsWithSeasonClub +
      result.fixtureHome +
      result.fixtureAway +
      result.fixtureWinner +
      result.events +
      result.standings +
      result.teamStats;
    problems += orgProblems;

    console.log(
      `[${orgProblems === 0 ? "OK" : "FAIL"}] ${organization.name}: seasonClubs=${result.seasonClubs} teamEntrants=${result.teamEntrants} missing=${missingEntrants} teamWithoutClub=${result.teamEntrantsWithoutSeasonClub} nonTeamWithClub=${result.nonTeamEntrantsWithSeasonClub} fixtureMismatch=${result.fixtureHome}/${result.fixtureAway}/${result.fixtureWinner} eventMismatch=${result.events} standingMismatch=${result.standings} teamStatMismatch=${result.teamStats}`,
    );
  }

  console.log(problems === 0 ? "PARITY OK" : `PARITY FAILED (${problems} problems)`);
  if (problems > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
