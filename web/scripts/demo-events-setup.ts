// Demo-mode seeder: one started (LIVE) sample event per sport, so capture consoles can be
// demonstrated end to end without touching production data.
//
// Safety model:
// - Every fixture/entrant is written with RecordOrigin.DEMO. The public allow-list
//   (productionPresentationFixtureWhere / isProductionPresentationFixture) accepts exactly
//   PRODUCTION, so demo events never appear on /live, scoreboards, broadcast graphics,
//   public APIs, or standings.
// - Demo competitions are named "Demo <Sport>" (slug demo-<slug>) and the demo purge tool
//   (npm run data:purge-demo -- --apply) already removes DEMO-origin data wholesale.
// - Idempotent: finds-or-creates by natural keys; re-running refreshes nothing and never
//   duplicates. Dry-run by default.
//
// Usage:
//   npx tsx scripts/demo-events-setup.ts            # dry run
//   npx tsx scripts/demo-events-setup.ts --apply    # create demo games
//   npx tsx scripts/demo-events-setup.ts --apply --live   # also start each game (LIVE)
import { prisma } from "../src/lib/prisma";
import { getSportDefinition, SPORT_DEFINITION_LIST } from "../src/lib/sports/registry";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "../src/lib/tenant-context";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const ORG_SLUG = "neon-ultra";
const SEASON_NAME = "Demo 2026";

type SportSpec = {
  slug: string;
  name: string;
  label: string;
  kind: "TEAM" | "INDIVIDUAL";
  clubA: string;
  clubB: string;
  playerA: string;
  playerB: string;
};

// All seven registered sports. Basketball appears twice: Ultra rules (default definition)
// and FIBA-style rules (a division-level RuleSet override of PERIOD_COUNT=4).
const SPORTS: SportSpec[] = [
  { slug: "basketball", name: "Basketball", label: "Basketball (Ultra rules)", kind: "TEAM", clubA: "Demo Hoops A", clubB: "Demo Hoops B", playerA: "Demo Hoops A", playerB: "Demo Hoops B" },
  { slug: "basketball", name: "Basketball", label: "Basketball (FIBA rules)", kind: "TEAM", clubA: "Demo FIBA A", clubB: "Demo FIBA B", playerA: "Demo FIBA A", playerB: "Demo FIBA B" },
  { slug: "volleyball", name: "Volleyball", label: "Volleyball", kind: "TEAM", clubA: "Demo Volley A", clubB: "Demo Volley B", playerA: "Demo Volley A", playerB: "Demo Volley B" },
  { slug: "football", name: "Football", label: "Football", kind: "TEAM", clubA: "Demo FC A", clubB: "Demo FC B", playerA: "Demo FC A", playerB: "Demo FC B" },
  { slug: "american-football", name: "American Football", label: "American Football", kind: "TEAM", clubA: "Demo Gridiron A", clubB: "Demo Gridiron B", playerA: "Demo Gridiron A", playerB: "Demo Gridiron B" },
  { slug: "tennis", name: "Tennis", label: "Tennis", kind: "INDIVIDUAL", clubA: "", clubB: "", playerA: "Demo Tennis Player A", playerB: "Demo Tennis Player B" },
  { slug: "table-tennis", name: "Table Tennis", label: "Table Tennis", kind: "INDIVIDUAL", clubA: "", clubB: "", playerA: "Demo Table Tennis A", playerB: "Demo Table Tennis B" },
];

function shortName(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
}

async function main() {
  const apply = flag("apply");
  const live = flag("live");
  const organization = await resolveActiveOrganizationBySlug(ORG_SLUG);
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} live=${live} org=${ORG_SLUG} sports=${SPORTS.length}`);

  const rows = await withOrganizationContext(organization.id, async (tx) => {
    const out: Array<Record<string, string | null>> = [];

    for (const spec of SPORTS) {
      const definition = getSportDefinition(spec.slug);
      const sportLabel = definition?.name ?? spec.name;
      const compSlug = `demo-${spec.slug}`;
      const compName = `Demo ${sportLabel}`;
      const isFiba = spec.label.includes("FIBA");
      const divisionName = isFiba ? "FIBA Rules" : "Open";
      const divisionSlug = divisionName.toLowerCase();

      // Sport catalog row.
      const sportRow = apply
        ? await tx.sport.upsert({ where: { slug: spec.slug }, update: { isActive: true }, create: { name: sportLabel, slug: spec.slug, isActive: true }, select: { id: true } })
        : await tx.sport.findUnique({ where: { slug: spec.slug }, select: { id: true } });

      let competition = await tx.competition.findFirst({ where: { organizationId: organization.id, slug: compSlug }, select: { id: true } });
      if (!competition && apply && sportRow) {
        competition = await tx.competition.create({
          data: { organizationId: organization.id, sportId: sportRow.id, name: compName, slug: compSlug, description: `Demonstration competition — ${spec.label}. DEMO origin: never shown publicly.` },
          select: { id: true },
        });
      }

      let season = competition
        ? await tx.season.findFirst({ where: { competitionId: competition.id, name: SEASON_NAME }, select: { id: true } })
        : null;
      if (!season && apply && competition) {
        season = await tx.season.create({
          data: { organizationId: organization.id, competitionId: competition.id, name: SEASON_NAME, startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: new Date("2026-12-31T23:59:59.000Z") },
          select: { id: true },
        });
      }

      let division = competition
        ? await tx.division.findFirst({ where: { competitionId: competition.id, slug: divisionSlug }, select: { id: true } })
        : null;
      if (!division && apply && competition) {
        division = await tx.division.create({ data: { organizationId: organization.id, competitionId: competition.id, name: divisionName, slug: divisionSlug }, select: { id: true } });
      }

      if (!apply || !competition || !season || !division || !sportRow) {
        out.push({ label: spec.label, note: "dry-run" });
        continue;
      }

      // FIBA variant: a per-division ruleset with four quarters overrides the Ultra shape.
      if (isFiba) {
        const existingRules = await tx.ruleSet.findFirst({ where: { seasonId: season.id, sportId: sportRow.id, isActive: true }, select: { id: true, config: true } });
        if (!existingRules) {
          await tx.ruleSet.create({
            data: {
              organizationId: organization.id,
              name: "Demo FIBA Rules",
              version: 1,
              isActive: true,
              seasonId: season.id,
              sportId: sportRow.id,
              config: { PERIOD_COUNT: 4, CLOCK_MODE: "STOPPAGE", SHOT_CLOCK_SECONDS: 24, ULTRA_TIME_ENABLED: false, FOUR_POINT_ENABLED: false },
            },
          });
        }
      }

      // Sides.
      let homeSeasonClubId: string | null = null;
      let awaySeasonClubId: string | null = null;
      let homeEntrantId: string | null = null;
      let awayEntrantId: string | null = null;

      if (spec.kind === "TEAM") {
        const ids: string[] = [];
        for (const clubName of [spec.clubA, spec.clubB]) {
          const short = shortName(clubName);
          let club = await tx.club.findFirst({ where: { organizationId: organization.id, shortName: short }, select: { id: true } });
          if (!club) {
            club = await tx.club.create({ data: { organizationId: organization.id, sportId: sportRow.id, name: clubName, shortName: short, recordOrigin: "DEMO" }, select: { id: true } });
          }
          let seasonClub = await tx.seasonClub!.findFirst({ where: { seasonId: season.id, clubId: club.id, divisionId: division.id }, select: { id: true } });
          if (!seasonClub) {
            seasonClub = await tx.seasonClub!.create({ data: { organizationId: organization.id, seasonId: season.id, clubId: club.id, divisionId: division.id, recordOrigin: "DEMO" }, select: { id: true } });
          }
          const entrant = await tx.entrant.findFirst({ where: { seasonClubId: seasonClub.id }, select: { id: true } });
          if (!entrant) {
            await tx.entrant.create({
              data: { organizationId: organization.id, competitionId: competition.id, seasonId: season.id, divisionId: division.id, seasonClubId: seasonClub.id, type: "TEAM", name: clubName, shortName: short },
            });
          }
          ids.push(seasonClub.id);
        }
        homeSeasonClubId = ids[0];
        awaySeasonClubId = ids[1];
      } else {
        const ids: string[] = [];
        for (const name of [spec.playerA, spec.playerB]) {
          let entrant = await tx.entrant.findFirst({ where: { seasonId: season.id, name }, select: { id: true } });
          if (!entrant) {
            entrant = await tx.entrant.create({
              data: { organizationId: organization.id, competitionId: competition.id, seasonId: season.id, divisionId: division.id, type: "INDIVIDUAL", name },
              select: { id: true },
            });
          }
          ids.push(entrant.id);
        }
        homeEntrantId = ids[0];
        awayEntrantId = ids[1];
      }

      // Venue: reuse the first organization venue.
      const venue = await tx.venue.findFirst({ where: { organizationId: organization.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
      if (!venue) throw new Error("No venue exists for the organization; create one first.");

      let fixture = await tx.fixture.findFirst({
        where: { seasonId: season.id, recordOrigin: "DEMO" },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, game: { select: { id: true, status: true } } },
      });
      let created = false;
      if (!fixture) {
        const newFixture = await tx.fixture.create({
          data: {
            organizationId: organization.id,
            seasonId: season.id,
            divisionId: division.id,
            homeSeasonClubId,
            awaySeasonClubId,
            homeEntrantId,
            awayEntrantId,
            scheduledAt: new Date(),
            venueId: venue.id,
            status: "LIVE",
            homeScore: 0,
            awayScore: 0,
            recordOrigin: "DEMO",
          },
          select: { id: true, status: true, game: { select: { id: true, status: true } } },
        });
        fixture = newFixture;
        created = true;
      }

      // Game row so the console is immediately capturable.
      const structure = definition?.structure;
      const periodSeconds = structure && structure.periodDurationSeconds > 0 ? structure.periodDurationSeconds : 600;
      const game = await tx.game.upsert({
        where: { fixtureId: fixture.id },
        create: {
          organizationId: organization.id,
          fixtureId: fixture.id,
          status: live ? "LIVE" : "NOT_STARTED",
          ...(live ? { startedAt: new Date(), clockStartedAt: new Date(), clockSecondsRemaining: periodSeconds } : {}),
          statSource: "ULTRA_NATIVE_LIVE_SCORER",
          dataCapability: "ULTRA_NATIVE_EVENTS",
        },
        update: live ? { status: "LIVE" } : {},
        select: { id: true, status: true },
      });

      out.push({
        label: spec.label,
        competition: compSlug,
        fixtureId: fixture.id,
        gameId: game.id,
        scorer: `/games/${fixture.id}/live`,
        statistician: `/games/${fixture.id}/stats`,
        note: created ? "created" : "existing",
      });
    }
    return out;
  });

  console.log(JSON.stringify(rows, null, 2));
  console.log(apply ? "applied." : "dry-run: nothing written (pass --apply).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());