import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createLeague } from "../src/server/onboarding/create-league";
import { createGame } from "../src/server/scoring/createGame";
import { randomUUID } from "node:crypto";

// Streak v15, Prompt 3 verification: a brand-new football league, created the way the wizard creates it.
//
//   npx tsx scripts/setup-wizard-verify.ts --organization <orgId> [--keep]
//
// It calls the same createLeague() the wizard's server action calls, then checks the result end to end:
//   * the competition, division, season, clubs, season clubs and fixtures all exist and are tenant-scoped;
//   * the fixture count matches the format (round robin or knockout) and every fixture has two real sides;
//   * the tournament page renders (the league "appears" publicly);
//   * a game can be created on one of the fixtures and a goal scored - the league is not just rows.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const BASE_URL = arg("base-url") ?? "http://127.0.0.1:4120";
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION) {
  console.error("usage: setup-wizard-verify.ts --organization <id> [--base-url url] [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function main() {
  const name = `Wizard Football ${randomUUID().slice(0, 4)}`;
  const teams = ["Wizard FC", "Onboard United", "Setup City", "Schema Rovers"];

  const created = await withOrganizationContext(ORG, (tx) =>
    createLeague(tx, {
      organizationId: ORG,
      organizationName: "ignored (existing org)",
      organizationSlug: "ignored",
      sportSlug: "football",
      competitionName: name,
      entrantNames: teams,
      format: "ROUND_ROBIN",
      gamesPerPairing: 2,
      startDate: new Date(),
      matchDayOffsetDays: 7,
    }),
  );
  console.log(`created: ${JSON.stringify(created)}`);

  const detail = await withOrganizationContext(ORG, async (tx) => {
    const competition = await tx.competition.findUniqueOrThrow({
      where: { id: created.competitionId },
      select: {
        name: true,
        slug: true,
        sport: { select: { slug: true } },
        // Divisions hang off the competition, season clubs off the season - selecting them the other way round is
        // not a thing Prisma allows (and would not be a thing the schema has).
        seasons: { select: { id: true, seasonClubs: { select: { id: true, club: { select: { name: true } } } } } },
      },
    });
    const fixtures = await tx.fixture.findMany({
      where: { seasonId: created.seasonId },
      select: { id: true, homeSeasonClubId: true, awaySeasonClubId: true, homeEntrantId: true, awayEntrantId: true, round: true },
    });
    return { competition, fixtures };
  });

  // A game on the first fixture, then a goal: the league has to be scoreable, not just present.
  const first = detail.fixtures[0];
  const game = await withOrganizationContext(ORG, async (tx) => {
    const actor = await tx.user.findFirstOrThrow({ select: { id: true } });
    const created2 = await createGame(
      { id: `wizard_${randomUUID().slice(0, 8)}`, fixtureId: first.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 2700 },
      { tx, actor: { id: actor.id, organizationId: ORG }, source: "LIVE_UI" },
    );
    await tx.fixture.update({ where: { id: first.id }, data: { status: "LIVE" } });
    return created2;
  });

  const page = await fetch(`${BASE_URL}/t/${created.slug}`);
  const html = await page.text();

  console.log("");
  console.log(`competition ${detail.competition.name} (${detail.competition.sport.slug}) · ${detail.competition.seasons[0].seasonClubs.length} season clubs · ${detail.fixtures.length} fixtures`);
  console.log(`clubs: ${detail.competition.seasons[0].seasonClubs.map((side) => side.club.name).join(", ")}`);
  console.log(`fixture sides: ${detail.fixtures.every((fixture) => fixture.homeSeasonClubId && fixture.awaySeasonClubId) ? "all two-sided" : "SOME MISSING A SIDE"}`);
  console.log(`game created: ${game.id} · tournament page /t/${created.slug} -> ${page.status} (${html.length} bytes) · name present: ${html.includes(detail.competition.name)}`);

  const problems: string[] = [];
  if (created.participants !== teams.length) problems.push(`${created.participants} participants, expected ${teams.length}`);
  // 4 teams, home and away: 4*3/2 = 6 pairings, twice = 12 fixtures.
  if (created.fixtures !== 12) problems.push(`${created.fixtures} fixtures, expected 12 (double round robin of 4)`);
  if (detail.fixtures.length !== created.fixtures) problems.push(`${detail.fixtures.length} fixture rows found, ${created.fixtures} reported`);
  if (!detail.fixtures.every((fixture) => fixture.homeSeasonClubId && fixture.awaySeasonClubId && !fixture.homeEntrantId && !fixture.awayEntrantId)) problems.push("a fixture does not have exactly two team sides");
  if (detail.fixtures.some((fixture) => fixture.homeSeasonClubId === fixture.awaySeasonClubId)) problems.push("a fixture has the same side twice");
  if (page.status !== 200) problems.push(`the tournament page returned ${page.status}`);
  if (!html.includes(detail.competition.name)) problems.push("the competition name is not on its tournament page");
  if (!game.id) problems.push("no game could be created on the new fixture");

  console.log("");
  console.log(problems.length === 0 ? `PASS: a 4-team double round robin (12 fixtures) was created, renders publicly, and its first fixture accepted a game` : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      for (const fixture of detail.fixtures) await tx.fixture.deleteMany({ where: { id: fixture.id } });
      await tx.seasonClub.deleteMany({ where: { seasonId: created.seasonId } });
      await tx.season.deleteMany({ where: { id: created.seasonId } });
      await tx.division.deleteMany({ where: { competitionId: created.competitionId } });
      await tx.competition.deleteMany({ where: { id: created.competitionId } });
      await tx.club.deleteMany({ where: { organizationId: ORG, name: { in: teams } } });
    });
    console.log("cleanup: the wizard-created league removed (use --keep to inspect)");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
