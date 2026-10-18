// P15 I1 pivot, verification: turn the hand-transcribed LBCL batch into the CSV format the new parser
// reads, parse it back, and compare the two - game by game, player by player, stat by stat.
//
// This is the evidence that the CSV path is not a toy: if the round trip is exact for all 32 real games,
// then an operator who receives the provider's CSV export gets the same numbers the transcription
// produced, without the transcription.
//
// Usage:
//   npx tsx scripts/csv-export-verify.ts                # all games, summary + timings
//   npx tsx scripts/csv-export-verify.ts --write <dir>  # also write the CSVs out
//   npx tsx scripts/csv-export-verify.ts --game 0 -v    # one game, verbose
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { csvToCorrected, parseBoxScoreCsv } from "../src/lib/scoresheet/csv-extract";
import { buildChecksumReport } from "../src/lib/scoresheet/checksums";

type JsonPlayer = {
  fullName: string;
  jerseyNumber: number | null;
  didNotPlay: boolean;
  minutesPlayed: number;
  points: number;
  fieldGoalsMade: number | null;
  fieldGoalsAttempted: number | null;
  twoPointsMade: number | null;
  twoPointsAttempted: number | null;
  threePointsMade: number | null;
  threePointsAttempted: number | null;
  freeThrowsMade: number | null;
  freeThrowsAttempted: number | null;
  offensiveRebounds: number | null;
  defensiveRebounds: number | null;
  assists: number | null;
  turnovers: number | null;
  steals: number | null;
  blocks: number | null;
  foulsCommitted: number | null;
};
type JsonTeam = { clubName: string; players: JsonPlayer[] };
type JsonGame = {
  tournament: { name: string };
  division: { name: string };
  season: { name: string };
  venue: { name: string };
  scheduledAt: string;
  homeScore: number;
  awayScore: number;
  periods: { label: string; homeScore: number; awayScore: number }[];
  home: JsonTeam;
  away: JsonTeam;
  sourceLabel: string;
};
type Batch = { games: JsonGame[] };

const n = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
const pair = (made: number | null | undefined, attempted: number | null | undefined) =>
  made === null || made === undefined ? "" : attempted === null || attempted === undefined ? String(made) : `${made}-${attempted}`;

function gameToCsv(game: JsonGame): string {
  const lines: string[] = [
    `# league: ${game.tournament.name}`,
    `# division: ${game.division.name}`,
    `# season: ${game.season.name}`,
    `# venue: ${game.venue.name}`,
    `# date: ${game.scheduledAt}`,
    `# sourceLabel: ${game.sourceLabel}`,
    `# homeScore: ${game.homeScore}`,
    `# awayScore: ${game.awayScore}`,
    ...game.periods.map((period) => `# period: ${period.label},${period.homeScore},${period.awayScore}`),
  ];
  const header = "No,Player,Min,PTS,FG,2P,3P,FT,OR,DR,REB,AST,TO,STL,BLK,PF";
  for (const team of [game.home, game.away]) {
    lines.push(`## ${team.clubName}`, header);
    for (const player of team.players) {
      const cells = [
        n(player.jerseyNumber),
        // A comma inside a name would break the row - quote it, which the parser handles.
        /[",]/.test(player.fullName) ? `"${player.fullName.replace(/"/g, '""')}"` : player.fullName,
        player.didNotPlay ? "DNP" : String(player.minutesPlayed),
        n(player.points),
        pair(player.fieldGoalsMade, player.fieldGoalsAttempted),
        pair(player.twoPointsMade, player.twoPointsAttempted),
        pair(player.threePointsMade, player.threePointsAttempted),
        pair(player.freeThrowsMade, player.freeThrowsAttempted),
        n(player.offensiveRebounds),
        n(player.defensiveRebounds),
        n((player.offensiveRebounds ?? 0) + (player.defensiveRebounds ?? 0)),
        n(player.assists),
        n(player.turnovers),
        n(player.steals),
        n(player.blocks),
        n(player.foulsCommitted),
      ];
      lines.push(cells.join(","));
    }
  }
  return `${lines.join("\n")}\n`;
}

type Diff = { game: number; field: string; json: unknown; csv: unknown };

function compare(gameIndex: number, game: JsonGame, csvText: string): Diff[] {
  const diffs: Diff[] = [];
  const parsed = parseBoxScoreCsv(csvText);
  const corrected = csvToCorrected(parsed);
  const push = (field: string, json: unknown, csv: unknown) => {
    if (String(json) !== String(csv)) diffs.push({ game: gameIndex, field, json, csv });
  };
  push("homeScore", game.homeScore, corrected.homeScore);
  push("awayScore", game.awayScore, corrected.awayScore);
  push("periods", game.periods.length, corrected.periods.length);
  for (const [side, jsonTeam] of [["home", game.home] as const, ["away", game.away] as const]) {
    const csvTeam = side === "home" ? corrected.home : corrected.away;
    push(`${side}.clubName`, jsonTeam.clubName, csvTeam.clubName);
    push(`${side}.players`, jsonTeam.players.length, csvTeam.players.length);
    const byName = new Map(csvTeam.players.map((player) => [player.name, player]));
    for (const player of jsonTeam.players) {
      const got = byName.get(player.fullName);
      if (!got) {
        diffs.push({ game: gameIndex, field: `${side}.missing`, json: player.fullName, csv: null });
        continue;
      }
      const checks: [string, string | number | null | undefined, string | number][] = [
        ["points", player.points, got.points],
        ["minutes", player.minutesPlayed, got.minutesPlayed],
        ["fgm", player.fieldGoalsMade, got.fgm],
        ["fga", player.fieldGoalsAttempted, got.fga],
        ["fg2m", player.twoPointsMade, got.fg2m],
        ["fg2a", player.twoPointsAttempted, got.fg2a],
        ["fg3m", player.threePointsMade, got.fg3m],
        ["fg3a", player.threePointsAttempted, got.fg3a],
        ["ftm", player.freeThrowsMade, got.ftm],
        ["fta", player.freeThrowsAttempted, got.fta],
        ["oreb", player.offensiveRebounds, got.oreb],
        ["dreb", player.defensiveRebounds, got.dreb],
        ["ast", player.assists, got.assists],
        ["to", player.turnovers, got.turnovers],
        ["stl", player.steals, got.steals],
        ["blk", player.blocks, got.blocks],
        ["pf", player.foulsCommitted, got.fouls],
        ["dnp", player.didNotPlay ? "true" : "false", got.didNotPlay ? "true" : "false"],
      ];
      for (const [label, expected, actual] of checks) {
        const normalised = expected === null || expected === undefined ? 0 : expected;
        push(`${side}.${player.fullName}.${label}`, normalised, actual);
      }
    }
  }
  return diffs;
}

async function main() {
  const argv = process.argv.slice(2);
  const writeIndex = argv.indexOf("--write");
  const outDir = writeIndex >= 0 ? argv[writeIndex + 1] : null;
  const gameIndex = argv.indexOf("--game") >= 0 ? Number(argv[argv.indexOf("--game") + 1]) : null;
  const verbose = argv.includes("-v");
  if (outDir) mkdirSync(outDir, { recursive: true });

  const batch = JSON.parse(readFileSync("scripts/data/lbcl-2026-batch1.json", "utf8")) as Batch;
  const games = gameIndex === null ? batch.games : [batch.games[gameIndex]];

  // JSON side: what the hand-transcribed provenance costs to load and validate.
  const jsonStart = performance.now();
  let jsonBytes = 0;
  for (const game of games) jsonBytes += JSON.stringify(game).length;
  const jsonMs = performance.now() - jsonStart;

  let csvBytes = 0;
  let csvMs = 0;
  const allDiffs: Diff[] = [];
  const checksumSummary: { game: number; total: number; failed: number }[] = [];
  let index = gameIndex ?? 0;
  for (const game of games) {
    const csvText = gameToCsv(game);
    csvBytes += csvText.length;
    if (outDir) writeFileSync(join(outDir, `lbcl-game-${String(index + 1).padStart(2, "0")}.csv`), csvText, "utf8");
    const started = performance.now();
    const diffs = compare(index, game, csvText);
    csvMs += performance.now() - started;
    allDiffs.push(...diffs);
    // Validate the parsed sheet with the same checksum rules the review queue uses.
    const corrected = csvToCorrected(parseBoxScoreCsv(csvText));
    const report = buildChecksumReport({
      teams: [
        { table: correctedToTable(corrected.home, "home"), label: corrected.home.clubName },
        { table: correctedToTable(corrected.away, "away"), label: corrected.away.clubName },
      ],
      periods: corrected.periods,
      homeScore: corrected.homeScore,
      awayScore: corrected.awayScore,
    });
    const failures = report.checks.filter((check) => !check.ok);
    checksumSummary.push({ game: index, total: report.checks.length, failed: failures.length });
    for (const failure of failures) console.log(`CHECK FAIL game ${index + 1}: ${failure.label} expected=${String(failure.expected)} actual=${String(failure.actual)}`);
    if (verbose || gameIndex !== null) {
      console.log(`game ${index + 1}: ${game.home.clubName} ${game.awayScore === undefined ? "" : ""}${game.homeScore}-${game.awayScore} ${game.away.clubName} Â· players ${game.home.players.length}+${game.away.players.length} Â· checks ${report.checks.length - report.checks.filter((c) => !c.ok).length}/${report.checks.length}`);
      for (const diff of diffs) console.log(`  DIFF ${diff.field}: json=${String(diff.json)} csv=${String(diff.csv)}`);
    }
    index += 1;
  }

  const failedChecks = checksumSummary.reduce((total, entry) => total + entry.failed, 0);
  console.log("");
  console.log(`games                 ${games.length}`);
  console.log(`csv bytes             ${csvBytes} (vs ${jsonBytes} JSON)`);
  console.log(`round-trip diffs      ${allDiffs.length}`);
  console.log(`checksum checks       ${checksumSummary.reduce((total, entry) => total + entry.total, 0)} total, ${failedChecks} failing`);
  console.log(`write+parse ms        ${csvMs.toFixed(1)} (json parse ${jsonMs.toFixed(1)})`);
  if (allDiffs.length > 0) {
    console.log("first diffs:", JSON.stringify(allDiffs.slice(0, 10), null, 1));
    process.exitCode = 1;
  }
}

// Local copy of the review queue's converter so this script has no React/server dependency.
function correctedToTable(team: { clubName: string; players: { points: number; fgm: number; fga: number; fg2m: number; fg2a: number; fg3m: number; fg3a: number; ftm: number; fta: number; oreb: number; dreb: number; reb: number; assists: number; turnovers: number; steals: number; blocks: number; fouls: number; name: string; jerseyNumber: number | null; didNotPlay: boolean; minutesPlayed: number }[]; totals: { points: number; rebounds: number; assists: number; turnovers: number; fouls: number } }, label: string) {
  const cell = (value: number) => ({ raw: String(value), value, confidence: 100 });
  return {
    teamLabel: `${label}:${team.clubName}`,
    headerRowIndex: 0,
    confidence: 100,
    warnings: [],
    totals: { points: cell(team.totals.points), reb: cell(team.totals.rebounds), assists: cell(team.totals.assists), turnovers: cell(team.totals.turnovers), fouls: cell(team.totals.fouls) },
    players: team.players.map((player, index) => ({
      rowIndex: index,
      jerseyNumber: player.jerseyNumber,
      name: player.name,
      minutesRaw: player.didNotPlay ? "DNP" : String(player.minutesPlayed),
      didNotPlay: player.didNotPlay,
      confidence: 100,
      cells: {
        points: cell(player.points),
        fgm: cell(player.fgm),
        fga: cell(player.fga),
        fg2m: cell(player.fg2m),
        fg2a: cell(player.fg2a),
        fg3m: cell(player.fg3m),
        fg3a: cell(player.fg3a),
        ftm: cell(player.ftm),
        fta: cell(player.fta),
        oreb: cell(player.oreb),
        dreb: cell(player.dreb),
        reb: cell(player.reb),
        assists: cell(player.assists),
        turnovers: cell(player.turnovers),
        steals: cell(player.steals),
        blocks: cell(player.blocks),
        fouls: cell(player.fouls),
      },
    })),
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
