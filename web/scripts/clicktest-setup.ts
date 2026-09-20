// Click-through test games for the P8-P11 sports (staging only).
//
// Creates one started (LIVE) test fixture per sport so both consoles open:
//   scorer:        /games/<fixtureId>/live
//   statistician:  /games/<fixtureId>/stats  (+ /games/<fixtureId>/stats/live for team sports)
//
// Sports: volleyball, football (soccer), tennis, american-football, table-tennis.
//
// Idempotent: finds-or-creates by natural keys; reuses the season's fixture if one
// already exists and ensures its game is LIVE. Dry-run by default.
// Runs inside tenant context against DATABASE_URL (use the privileged migrate.env URL).
//
// Usage:
//   npx tsx scripts/clicktest-setup.ts
//   npx tsx scripts/clicktest-setup.ts --apply
import { prisma } from "../src/lib/prisma";
import { getSportDefinition } from "../src/lib/sports/registry";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "../src/lib/tenant-context";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const ORG_SLUG = "neon-ultra";

type SportSetup = {
  slug: string;
  name: string;
  kind: "TEAM" | "INDIVIDUAL";
  label: string;
};

const SPORTS: SportSetup[] = [
  { slug: "volleyball", name: "Volleyball", kind: "TEAM", label: "Volleyball (sets + P10 depth)" },
  { slug: "football", name: "Football", kind: "TEAM", label: "Football/Soccer (goals + P10 depth)" },
  { slug: "tennis", name: "Tennis", kind: "INDIVIDUAL", label: "Tennis (points/games/sets + P10 depth)" },
  { slug: "american-football", name: "American Football", kind: "TEAM", label: "American Football (P8 POINTS console)" },
  { slug: "table-tennis", name: "Table Tennis", kind: "INDIVIDUAL", label: "Table Tennis (P9 SETS console)" },
];

// [primary, secondary] scoreboard colors for the two individual entrants, per sport.
const ENTRANT_COLORS: Record<string, [string, string][]> = {
  tennis: [
    ["#16F2B3", "#071713"],
    ["#9B5CFF", "#160C24"],
  ],
  "table-tennis": [
    ["#36A3FF", "#071524"],
    ["#FF4D8D", "#240812"],
  ],
  default: [
    ["#16F2B3", "#071713"],
    ["#FFB84D", "#231506"],
  ],
};

async function main() {
  const apply = flag("apply");
  const organization = await resolveActiveOrganizationBySlug(ORG_SLUG);
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} org=${ORG_SLUG} sports=${SPORTS.length}`);

  const rows = await withOrganizationContext(organization.id, async (tx) => {
    const venue = await tx.venue.findFirst({
      where: { organizationId: organization.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (!venue) throw new Error("No venue exists for the organization; create one first.");

    const out: Array<Record<string, string | null>> = [];
    for (const sport of SPORTS) {
      const definition = getSportDefinition(sport.slug);
      const clockSeconds = definition && definition.structure.periodDurationSeconds > 0
        ? definition.structure.periodDurationSeconds
        : 600;

      const sportRow = apply
        ? await tx.sport.upsert({
            where: { slug: sport.slug },
            update: { name: sport.name, isActive: true },
            create: { name: sport.name, slug: sport.slug, isActive: true },
            select: { id: true, slug: true },
          })
        : await tx.sport.findUnique({ where: { slug: sport.slug }, select: { id: true, slug: true } });

      const compSlug = `clicktest-${sport.slug}`;
      const compName = `Click-Test ${sport.name}`;
      let competition = await tx.competition.findFirst({
        where: { organizationId: organization.id, slug: compSlug },
        select: { id: true },
      });
      if (!competition && apply && sportRow) {
        competition = await tx.competition.create({
          data: {
            organizationId: organization.id,
            sportId: sportRow.id,
            name: compName,
            slug: compSlug,
            description: `Click-through test competition for ${sport.label}.`,
          },
          select: { id: true },
        });
      }

      let season = competition
        ? await tx.season.findFirst({ where: { competitionId: competition.id, name: "Click-Test 2026" }, select: { id: true } })
        : null;
      if (!season && apply && competition) {
        season = await tx.season.create({
          data: {
            organizationId: organization.id,
            competitionId: competition.id,
            name: "Click-Test 2026",
            startDate: new Date("2026-09-01T00:00:00.000Z"),
            endDate: new Date("2026-12-31T23:59:59.000Z"),
          },
          select: { id: true },
        });
      }

      let division = competition
        ? await tx.division.findFirst({ where: { competitionId: competition.id, slug: "open" }, select: { id: true } })
        : null;
      if (!division && apply && competition) {
        division = await tx.division.create({
          data: { organizationId: organization.id, competitionId: competition.id, name: "Open", slug: "open" },
          select: { id: true },
        });
      }

      if (!apply || !competition || !season || !division || !sportRow) {
        out.push({ sport: sport.slug, label: sport.label, fixtureId: null, gameId: null, note: "dry-run or missing parent" });
        continue;
      }

      // Sides: SeasonClubs for TEAM sports, INDIVIDUAL Entrants otherwise.
      let homeSeasonClubId: string | null = null;
      let awaySeasonClubId: string | null = null;
      let homeEntrantId: string | null = null;
      let awayEntrantId: string | null = null;

      if (sport.kind === "TEAM") {
        const ids: string[] = [];
        const tags = ["A", "B"] as const;
        for (const tag of tags) {
          const shortName = `CT${sport.slug.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase()}${tag}`;
          const clubName = `Click-Test ${sport.name} ${tag}`;
          let club = await tx.club.findFirst({ where: { organizationId: organization.id, shortName }, select: { id: true } });
          if (!club) {
            club = await tx.club.create({
              data: { organizationId: organization.id, sportId: sportRow.id, name: clubName, shortName },
              select: { id: true },
            });
          }
          let seasonClub = await tx.seasonClub!.findFirst({
            where: { seasonId: season.id, clubId: club.id, divisionId: division.id },
            select: { id: true },
          });
          if (!seasonClub) {
            seasonClub = await tx.seasonClub!.create({
              data: { organizationId: organization.id, seasonId: season.id, clubId: club.id, divisionId: division.id },
              select: { id: true },
            });
          }
          // Keep the one-TEAM-Entrant-per-SeasonClub invariant (Stage 2 backfill rule).
          const entrant = await tx.entrant.findFirst({ where: { seasonClubId: seasonClub.id }, select: { id: true } });
          if (!entrant) {
            await tx.entrant.create({
              data: {
                organizationId: organization.id,
                competitionId: competition.id,
                seasonId: season.id,
                divisionId: division.id,
                seasonClubId: seasonClub.id,
                type: "TEAM",
                name: clubName,
                shortName,
              },
            });
          }
          ids.push(seasonClub.id);
        }
        homeSeasonClubId = ids[0];
        awaySeasonClubId = ids[1];
      } else {
        // Distinct scoreboard colors per player (individual entrants have no club colors).
        const pair = ENTRANT_COLORS[sport.slug] ?? ENTRANT_COLORS.default;
        const ids: string[] = [];
        for (const [index, tag] of (["A", "B"] as const).entries()) {
          const name = `CT ${sport.name} Player ${tag}`;
          const colors = pair[index];
          let entrant = await tx.entrant.findFirst({ where: { seasonId: season.id, name }, select: { id: true } });
          if (!entrant) {
            entrant = await tx.entrant.create({
              data: {
                organizationId: organization.id,
                competitionId: competition.id,
                seasonId: season.id,
                divisionId: division.id,
                type: "INDIVIDUAL",
                name,
                primaryColor: colors[0],
                secondaryColor: colors[1],
              },
              select: { id: true },
            });
          } else {
            // Backfill colors on entrants created before colors were assigned.
            await tx.entrant.update({
              where: { id: entrant.id },
              data: { primaryColor: colors[0], secondaryColor: colors[1] },
            });
          }
          ids.push(entrant.id);
        }
        homeEntrantId = ids[0];
        awayEntrantId = ids[1];
      }

      let fixture = await tx.fixture.findFirst({
        where: { seasonId: season.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true },
      });
      if (!fixture) {
        fixture = await tx.fixture.create({
          data: {
            organizationId: organization.id,
            seasonId: season.id,
            divisionId: division.id,
            homeSeasonClubId,
            awaySeasonClubId,
            homeEntrantId,
            awayEntrantId,
            scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
            venueId: venue.id,
            status: "SCHEDULED",
            homeScore: 0,
            awayScore: 0,
          },
          select: { id: true, status: true },
        });
      }

      // Start the game (same shape as the startGame server action, minus the rule snapshot,
      // which the console treats as optional and falls back to LEGACY_STRUCTURE).
      const game = await tx.game.upsert({
        where: { fixtureId: fixture.id },
        create: {
          organizationId: organization.id,
          fixtureId: fixture.id,
          status: "LIVE",
          startedAt: new Date(),
          clockStartedAt: new Date(),
          clockSecondsRemaining: clockSeconds,
          statSource: "ULTRA_NATIVE_LIVE_SCORER",
          dataCapability: "ULTRA_NATIVE_EVENTS",
        },
        update: { status: "LIVE" },
        select: { id: true, status: true },
      });
      if (fixture.status !== "LIVE") {
        await tx.fixture.update({ where: { id: fixture.id }, data: { status: "LIVE" } });
      }

      out.push({
        sport: sport.slug,
        label: sport.label,
        fixtureId: fixture.id,
        gameId: game.id,
        scorer: `/games/${fixture.id}/live`,
        statistician: `/games/${fixture.id}/stats`,
        statLive: sport.kind === "TEAM" ? `/games/${fixture.id}/stats/live` : null,
        note: "LIVE test game",
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
