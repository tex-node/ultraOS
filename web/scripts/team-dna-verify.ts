import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { loadSeasonGameCores } from "../src/lib/analytics/game-analytics";
import { computeLeagueTeamDna, TEAM_DNA_TAG_LABEL } from "../src/lib/analytics/team-dna";

// Streak v9, Prompt 4 verification: the public club page's Team DNA tags must match the data they claim to
// describe.
//
//   npx tsx scripts/team-dna-verify.ts --organization <orgId> [--base-url http://127.0.0.1:4120]
//
// It computes the DNA for the club's current season exactly as the page does, then fetches the rendered page and
// asserts that every tag label the computation produced is actually on the page - and that a club with no tags
// does not invent one. The tag thresholds live in team-dna.ts (index >= 1.15 against the league average), so this
// checks the pipeline end to end rather than re-deriving the rules.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const BASE_URL = arg("base-url") ?? "http://127.0.0.1:4120";
if (!ORGANIZATION) {
  console.error("usage: team-dna-verify.ts --organization <id> [--base-url url]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function main() {
  // The club with the most FINAL games in an active season: the page only renders DNA when games exist.
  const candidates = await withOrganizationContext(ORG, (tx) =>
    tx.seasonClub.findMany({
      where: { status: "ACTIVE", season: { fixtures: { some: { status: "FINAL" } } } },
      orderBy: { season: { startDate: "desc" } },
      take: 6,
      select: { id: true, club: { select: { name: true, shortName: true, id: true } }, season: { select: { id: true, name: true } }, division: { select: { competition: { select: { name: true } } } } },
    }),
  );
  if (candidates.length === 0) throw new Error("no active season club with FINAL fixtures");

  const problems: string[] = [];
  for (const candidate of candidates) {
    const games = await withOrganizationContext(ORG, (tx) => loadSeasonGameCores(candidate.season.id, tx));
    if (games.length === 0) continue;
    const dna = computeLeagueTeamDna(games).get(candidate.id);
    if (!dna) continue;

    const locator = await prisma.publicResourceLocator.findFirst({
      where: { organizationId: ORG, resourceType: "CLUB", resourceId: candidate.club.id },
      select: { publicKey: true },
    });
    const expected = dna.tags.map((tag) => TEAM_DNA_TAG_LABEL[tag]);
    console.log(`\n${candidate.club.name} (${candidate.season.name}) · ${dna.gamesPlayed} games · qualification ${dna.qualification}`);
    console.log(`  computed tags: ${expected.length > 0 ? expected.join(", ") : "(none)"}`);
    console.log(`  top dimensions: ${[...dna.dimensions].filter((d) => d.index !== null).sort((a, b) => (b.index ?? 0) - (a.index ?? 0)).slice(0, 3).map((d) => `${d.label} ${d.index?.toFixed(2)}×`).join(", ")}`);
    if (!locator) {
      console.log("  no public locator: the page URL is unknown, skipping the render check");
      continue;
    }

    const response = await fetch(`${BASE_URL}/public/clubs/${locator.publicKey}`, { redirect: "manual" });
    const html = await response.text();
    console.log(`  GET /public/clubs/${locator.publicKey} -> ${response.status} (${html.length} bytes)`);
    if (response.status !== 200) {
      problems.push(`${candidate.club.name}: page returned ${response.status}`);
      continue;
    }
    if (!/Team DNA/.test(html)) problems.push(`${candidate.club.name}: no "Team DNA" heading on the page`);
    for (const label of expected) {
      if (!html.includes(label)) problems.push(`${candidate.club.name}: computed tag "${label}" is missing from the page`);
    }
    // A club with no tags must not display a tag it did not earn.
    const allLabels = Object.values(TEAM_DNA_TAG_LABEL);
    const shown = allLabels.filter((label) => html.includes(label));
    const unearned = shown.filter((label) => !expected.includes(label));
    if (unearned.length > 0) problems.push(`${candidate.club.name}: page shows tag(s) the data does not support: ${unearned.join(", ")}`);
    if (problems.length === 0) console.log(`  every computed tag is on the page (${shown.length} shown)`);
  }

  console.log("");
  console.log(problems.length === 0 ? "PASS: Team DNA on the public club page matches the computed analytics" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
