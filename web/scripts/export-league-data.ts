import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

// Bulk export of one organization's league data for cold storage or a manual partner delivery (streak v9, Prompt
// 3). The API endpoint serves one tournament per request; this is the "give me everything" path.
//
//   npx tsx scripts/export-league-data.ts --organization <orgId> --out /tmp/export [--include-stats]
//
// Writes a directory of JSON + CSV files rather than a zip: a CSV of fixtures and a CSV of stat lines are what a
// partner actually loads, and zipping is one `zip -r` away (documented in the output). Every file is written only
// after its own query succeeds, so a partial export is visibly partial.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const OUT = arg("out") ?? `/tmp/ultraos-export-${new Date().toISOString().slice(0, 10)}`;
const INCLUDE_STATS = process.argv.includes("--include-stats");
if (!ORGANIZATION) {
  console.error("usage: export-league-data.ts --organization <id> [--out dir] [--include-stats]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

function csv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`exporting organization ${ORG} to ${OUT}`);

  const data = await withOrganizationContext(ORG, async (tx) => {
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: ORG }, select: { id: true, name: true, slug: true } });
    const competitions = await tx.competition.findMany({
      where: { organizationId: ORG },
      select: { id: true, name: true, slug: true, sport: { select: { slug: true, name: true } }, divisions: { select: { id: true, name: true, slug: true } } },
    });
    const seasons = await tx.season.findMany({
      where: { organizationId: ORG },
      select: { id: true, name: true, startDate: true, endDate: true, competitionId: true },
    });
    const clubs = await tx.club.findMany({ where: { organizationId: ORG }, select: { id: true, name: true, shortName: true, sportId: true } });
    const entrants = await tx.entrant.findMany({ where: { organizationId: ORG }, select: { id: true, name: true, type: true, seasonId: true, competitionId: true } });
    const fixtures = await tx.fixture.findMany({
      where: { organizationId: ORG },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        seasonId: true,
        scheduledAt: true,
        status: true,
        homeScore: true,
        awayScore: true,
        round: true,
        homeSeasonClub: { select: { club: { select: { name: true, shortName: true } } } },
        awaySeasonClub: { select: { club: { select: { name: true, shortName: true } } } },
        homeEntrant: { select: { name: true } },
        awayEntrant: { select: { name: true } },
        game: { select: { id: true, status: true, dataCapability: true } },
      },
    });
    const standings = await tx.standing.findMany({
      where: { organizationId: ORG },
      select: {
        seasonId: true,
        played: true,
        won: true,
        lost: true,
        drawn: true,
        leaguePoints: true,
        rank: true,
        rankTiebreak: true,
        seasonClub: { select: { club: { select: { name: true, shortName: true } } } },
        entrant: { select: { name: true } },
      },
    });
    const stats = INCLUDE_STATS
      ? await tx.playerStat.findMany({
          where: { organizationId: ORG },
          select: {
            gameId: true,
            playerId: true,
            minutesPlayed: true,
            points: true,
            rebounds: true,
            assists: true,
            steals: true,
            blocks: true,
            turnovers: true,
            fouls: true,
            statSource: true,
            player: { select: { athlete: { select: { firstName: true, lastName: true } }, seasonClub: { select: { club: { select: { shortName: true } } } } } },
            game: { select: { fixtureId: true } },
          },
        })
      : [];
    return { organization, competitions, seasons, clubs, entrants, fixtures, standings, stats };
  });

  const write = (name: string, content: string) => {
    writeFileSync(join(OUT, name), content, "utf8");
    console.log(`  ${name}  ${(content.length / 1024).toFixed(1)} KB`);
  };

  write("manifest.json", JSON.stringify({ exportedAt: new Date().toISOString(), organization: data.organization, includeStats: INCLUDE_STATS, counts: { competitions: data.competitions.length, seasons: data.seasons.length, fixtures: data.fixtures.length, standings: data.standings.length, stats: data.stats.length } }, null, 2));
  write("competitions.json", JSON.stringify(data.competitions, null, 2));
  write("seasons.json", JSON.stringify(data.seasons, null, 2));
  write("clubs.json", JSON.stringify(data.clubs, null, 2));
  write("entrants.json", JSON.stringify(data.entrants, null, 2));
  write(
    "fixtures.csv",
    csv(
      data.fixtures.map((fixture) => ({
        fixtureId: fixture.id,
        seasonId: fixture.seasonId,
        scheduledAt: fixture.scheduledAt.toISOString(),
        status: fixture.status,
        round: fixture.round ?? "",
        home: fixture.homeSeasonClub?.club.name ?? fixture.homeEntrant?.name ?? "",
        away: fixture.awaySeasonClub?.club.name ?? fixture.awayEntrant?.name ?? "",
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        gameId: fixture.game?.id ?? "",
        gameStatus: fixture.game?.status ?? "",
        dataCapability: fixture.game?.dataCapability ?? "",
      })),
    ),
  );
  write(
    "standings.csv",
    csv(
      data.standings.map((row) => ({
        seasonId: row.seasonId,
        team: row.seasonClub?.club.name ?? row.entrant?.name ?? "",
        played: row.played,
        won: row.won,
        lost: row.lost,
        drawn: row.drawn,
        points: row.leaguePoints,
        rank: row.rank ?? "",
        tiebreak: row.rankTiebreak ?? "",
      })),
    ),
  );
  if (INCLUDE_STATS) {
    write(
      "player-stats.csv",
      csv(
        data.stats.map((row) => ({
          fixtureId: row.game.fixtureId,
          gameId: row.gameId,
          playerId: row.playerId,
          player: `${row.player.athlete.firstName} ${row.player.athlete.lastName}`.trim(),
          club: row.player.seasonClub?.club.shortName ?? "",
          minutes: row.minutesPlayed,
          points: row.points,
          rebounds: row.rebounds,
          assists: row.assists,
          steals: row.steals,
          blocks: row.blocks,
          turnovers: row.turnovers,
          fouls: row.fouls,
          statSource: row.statSource,
        })),
      ),
    );
  }
  write("README.txt", `UltraLeagueOS export\norganization: ${data.organization.name} (${data.organization.id})\nexportedAt: ${new Date().toISOString()}\nincludeStats: ${INCLUDE_STATS}\n\nContents\n  manifest.json      counts and metadata\n  competitions.json  competitions with their divisions and sport\n  seasons.json       seasons\n  clubs.json / entrants.json  participants\n  fixtures.csv       every fixture with its final score and game capability\n  standings.csv      the stored standings rows\n  player-stats.csv   per-player box scores (only with --include-stats)\n\nTo hand this to a partner: zip -r ultraos-export.zip ${OUT}\n`);
  console.log(`done: ${data.fixtures.length} fixtures, ${data.standings.length} standing rows${INCLUDE_STATS ? `, ${data.stats.length} stat lines` : ""}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
