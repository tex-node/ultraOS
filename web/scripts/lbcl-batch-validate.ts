// Validate a transcribed LBCL box-score batch BEFORE it reaches the database.
//
// WHY. The sheets are photographed at a resolution where a digit is a guess unless it is checked against something the
// sheet prints twice. Every FIBA sheet prints the same facts three ways - the final score, the period scores, and the team
// totals row - so a batch that does not reconcile with those is not trustworthy, however carefully it was typed. This is
// the same rule the OCR pipeline's checksums enforce, applied to hand transcription.
//
//   npx tsx scripts/lbcl-batch-validate.ts scripts/data/lbcl-2026-game42.json
//
// Exits non-zero when any check fails, so it can gate an ingest run.
import { readFileSync } from "node:fs";

type Player = {
  fullName: string;
  jerseyNumber?: number | null;
  didNotPlay?: boolean;
  points: number;
  fieldGoalsMade?: number;
  fieldGoalsAttempted?: number;
  twoPointsMade?: number;
  twoPointsAttempted?: number;
  threePointsMade?: number;
  threePointsAttempted?: number;
  freeThrowsMade?: number;
  freeThrowsAttempted?: number;
  offensiveRebounds?: number;
  defensiveRebounds?: number;
  assists?: number;
  turnovers?: number;
  foulsCommitted?: number;
};
type Team = {
  clubShortName: string;
  clubName: string;
  players: Player[];
  totals: { points: number; rebounds?: number; assists?: number; turnovers?: number; fouls?: number };
  // The sheet prints a "Team/Coach" row for rebounds that belong to nobody (OKH: 28 player rebounds + 5 team = 33).
  // Those values are part of the printed totals, so a check that ignored them would report a false mismatch.
  teamAggregates?: { rebounds?: number; assists?: number; turnovers?: number; fouls?: number };
};
type Game = {
  scheduledAt: string;
  homeScore: number;
  awayScore: number;
  periods: { period: number; homeScore: number; awayScore: number }[];
  home: Team;
  away: Team;
  sourceLabel: string;
};
type Batch = { games: Game[] };

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function checkTeam(label: string, team: Team, printedScore: number, failures: string[]) {
  const played = team.players.filter((player) => !player.didNotPlay);
  const points = sum(played.map((player) => player.points));
  if (points !== printedScore) failures.push(`${label}: player points sum ${points} != printed score ${printedScore}`);

  for (const player of played) {
    const two = player.twoPointsMade ?? 0;
    const three = player.threePointsMade ?? 0;
    const ft = player.freeThrowsMade ?? 0;
    const identity = two * 2 + three * 3 + ft;
    if (identity !== player.points) {
      failures.push(`${label} #${player.jerseyNumber ?? "?"} ${player.fullName}: 2PM*2 + 3PM*3 + FTM = ${identity} but PTS = ${player.points}`);
    }
    const fg = player.fieldGoalsMade ?? 0;
    if ((player.twoPointsMade ?? 0) + (player.threePointsMade ?? 0) !== fg) {
      failures.push(`${label} #${player.jerseyNumber ?? "?"} ${player.fullName}: 2PM + 3PM != FGM`);
    }
    if ((player.twoPointsMade ?? 0) > (player.twoPointsAttempted ?? 0)) failures.push(`${label} ${player.fullName}: 2PM > 2PA`);
    if ((player.threePointsMade ?? 0) > (player.threePointsAttempted ?? 0)) failures.push(`${label} ${player.fullName}: 3PM > 3PA`);
    if ((player.freeThrowsMade ?? 0) > (player.freeThrowsAttempted ?? 0)) failures.push(`${label} ${player.fullName}: FTM > FTA`);
    if ((player.twoPointsAttempted ?? 0) + (player.threePointsAttempted ?? 0) !== (player.fieldGoalsAttempted ?? 0)) {
      failures.push(`${label} #${player.jerseyNumber ?? "?"} ${player.fullName}: 2PA + 3PA != FGA`);
    }
  }

  // Team totals are only checked when the batch states them; rebounds are printed as one row and are the column
  // most often misread, so a mismatch is reported rather than silently ignored.
  const totals = team.totals;
  const teamAggregates = team.teamAggregates ?? {};
  if (typeof totals.assists === "number") {
    const assists = sum(played.map((player) => player.assists ?? 0)) + (teamAggregates.assists ?? 0);
    if (assists !== totals.assists) failures.push(`${label}: assists sum ${assists} != printed ${totals.assists}`);
  }
  if (typeof totals.turnovers === "number") {
    const turnovers = sum(played.map((player) => player.turnovers ?? 0)) + (teamAggregates.turnovers ?? 0);
    if (turnovers !== totals.turnovers) failures.push(`${label}: turnovers sum ${turnovers} != printed ${totals.turnovers}`);
  }
  if (typeof totals.fouls === "number") {
    const fouls = sum(played.map((player) => player.foulsCommitted ?? 0)) + (teamAggregates.fouls ?? 0);
    if (fouls !== totals.fouls) failures.push(`${label}: fouls sum ${fouls} != printed ${totals.fouls}`);
  }
  if (typeof totals.rebounds === "number") {
    const rebounds = sum(played.map((player) => (player.offensiveRebounds ?? 0) + (player.defensiveRebounds ?? 0))) + (teamAggregates.rebounds ?? 0);
    if (rebounds !== totals.rebounds) failures.push(`${label}: rebounds sum ${rebounds} != printed ${totals.rebounds}`);
  }
}

const path = process.argv[2];
if (!path) {
  console.error("usage: lbcl-batch-validate.ts <batch.json>");
  process.exit(2);
}
const batch = JSON.parse(readFileSync(path, "utf8")) as Batch;
let failures = 0;

for (const game of batch.games) {
  const label = `${game.scheduledAt.slice(0, 10)} ${game.home.clubShortName} ${game.homeScore}-${game.awayScore} ${game.away.clubShortName}`;
  const gameFailures: string[] = [];
  const homePeriods = sum(game.periods.map((period) => period.homeScore));
  const awayPeriods = sum(game.periods.map((period) => period.awayScore));
  if (homePeriods !== game.homeScore) gameFailures.push(`periods: home ${homePeriods} != final ${game.homeScore}`);
  if (awayPeriods !== game.awayScore) gameFailures.push(`periods: away ${awayPeriods} != final ${game.awayScore}`);
  checkTeam(`${game.home.clubShortName} (home)`, game.home, game.homeScore, gameFailures);
  checkTeam(`${game.away.clubShortName} (away)`, game.away, game.awayScore, gameFailures);

  if (gameFailures.length === 0) {
    console.log(`PASS  ${label}  (${game.home.players.length}+${game.away.players.length} rows)`);
  } else {
    failures += gameFailures.length;
    console.log(`FAIL  ${label}`);
    for (const failure of gameFailures) console.log(`        ${failure}`);
  }
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
