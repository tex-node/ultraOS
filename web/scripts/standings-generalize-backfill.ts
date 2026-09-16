// Multi-sport Stage 5 (S5.1 backfill): add entrant identity, rank, and the deciding tiebreak key
// to existing Standing rows.
//
// Ranking uses the sport definition's tiebreak chain via rankStandingRows. Core record fields
// (played/won/lost/points) are NOT recomputed here - this only adds the generic columns. Idempotent.
//
// Dry-run by default. Pass --apply to write. Runs per organization through withOrganizationContext.
//
// Usage:
//   tsx scripts/standings-generalize-backfill.ts
//   tsx scripts/standings-generalize-backfill.ts --apply
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { getSportDefinition } from "../src/lib/sports/registry";
import { rankStandingRows, type StandingRow } from "../src/lib/sports/standings";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = flag("apply");
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} organizations=${organizations.length}`);

  const totals = { updated: 0, skipped: 0 };

  for (const organization of organizations) {
    await withOrganizationContext(organization.id, async (tx) => {
      const entrants = await tx.entrant.findMany({
        where: { organizationId: organization.id, seasonClubId: { not: null } },
        select: { id: true, seasonClubId: true },
      });
      const entrantBySeasonClub = new Map(entrants.map((entrant) => [entrant.seasonClubId as string, entrant.id]));

      const standings = await tx.standing.findMany({
        select: {
          id: true,
          seasonId: true,
          seasonClubId: true,
          entrantId: true,
          played: true,
          won: true,
          drawn: true,
          lost: true,
          ties: true,
          noResult: true,
          pointsFor: true,
          pointsAgainst: true,
          pointDifference: true,
          leaguePoints: true,
          seasonClub: { select: { club: { select: { name: true } } } },
          season: { select: { competition: { select: { sport: { select: { slug: true } } } } } },
        },
      });

      const bySeason = new Map<string, typeof standings>();
      for (const standing of standings) {
        const list = bySeason.get(standing.seasonId) ?? [];
        list.push(standing);
        bySeason.set(standing.seasonId, list);
      }

      let updated = 0;
      let skipped = 0;
      for (const group of bySeason.values()) {
        const slug = group[0].season.competition.sport.slug;
        const definition = getSportDefinition(slug);
        if (!definition) {
          skipped += group.length;
          continue;
        }

        const keyFor = (standing: (typeof group)[number]) =>
          standing.entrantId ?? entrantBySeasonClub.get(standing.seasonClubId!) ?? standing.seasonClubId!;

        const rows: StandingRow[] = group.map((standing) => ({
          entrantId: keyFor(standing),
          name: standing.seasonClub!.club.name,
          played: standing.played,
          won: standing.won,
          drawn: standing.drawn,
          lost: standing.lost,
          ties: standing.ties,
          noResult: standing.noResult,
          pointsFor: standing.pointsFor,
          pointsAgainst: standing.pointsAgainst,
          pointDifference: standing.pointDifference,
          leaguePoints: standing.leaguePoints,
          rank: 0,
          rankTiebreak: null,
          secondary: {},
        }));
        const ranked = rankStandingRows(definition, rows);
        const rankedByKey = new Map(ranked.map((row) => [row.entrantId, row]));

        for (const standing of group) {
          const ranked1 = rankedByKey.get(keyFor(standing));
          if (!ranked1) continue;
          if (apply) {
            await tx.standing.update({
              where: { id: standing.id },
              data: {
                entrantId: standing.entrantId ?? entrantBySeasonClub.get(standing.seasonClubId!) ?? null,
                rank: ranked1.rank,
                rankTiebreak: ranked1.rankTiebreak,
              },
            });
          }
          updated += 1;
        }
      }

      totals.updated += updated;
      totals.skipped += skipped;
      console.log(`  ${organization.name}: standings=${standings.length} updated=${updated} skipped=${skipped}`);
    });
  }

  console.log(`done: ${JSON.stringify(totals)} (${apply ? "written" : "dry-run, nothing written"})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
