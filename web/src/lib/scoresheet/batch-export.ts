import * as XLSX from "xlsx";

// Batch -> export-file conversion, shared by the verification scripts (Prompt 1/2, streak v4).
//
// The rows are produced ONCE as a string matrix and then written as CSV or as an .xlsx, so the two files
// are guaranteed to describe the same table - which is what makes "the workbook yields the same batch as
// the CSV" a meaningful claim rather than a coincidence.

export type BatchPlayer = {
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

export type BatchTeam = { clubName: string; players: BatchPlayer[] };

export type BatchGame = {
  tournament: { name: string };
  division: { name: string };
  season: { name: string };
  venue: { name: string };
  scheduledAt: string;
  homeScore: number;
  awayScore: number;
  periods: { label: string; homeScore: number; awayScore: number }[];
  home: BatchTeam;
  away: BatchTeam;
  sourceLabel: string;
};

const n = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
const pair = (made: number | null | undefined, attempted: number | null | undefined) =>
  made === null || made === undefined ? "" : attempted === null || attempted === undefined ? String(made) : `${made}-${attempted}`;

/** The whole file as a row-major matrix: metadata comment lines first, then the two team sections. */
export function batchGameToRows(game: BatchGame): string[][] {
  const rows: string[][] = [
    [`# league: ${game.tournament.name}`],
    [`# division: ${game.division.name}`],
    [`# season: ${game.season.name}`],
    [`# venue: ${game.venue.name}`],
    [`# date: ${game.scheduledAt}`],
    [`# sourceLabel: ${game.sourceLabel}`],
    [`# homeScore: ${game.homeScore}`],
    [`# awayScore: ${game.awayScore}`],
    ...game.periods.map((period) => [`# period: ${period.label},${period.homeScore},${period.awayScore}`]),
  ];
  const header = ["No", "Player", "Min", "PTS", "FG", "2P", "3P", "FT", "OR", "DR", "REB", "AST", "TO", "STL", "BLK", "PF"];
  for (const team of [game.home, game.away]) {
    rows.push([`## ${team.clubName}`], header);
    for (const player of team.players) {
      rows.push([
        n(player.jerseyNumber),
        player.fullName,
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
      ]);
    }
  }
  return rows;
}

/** RFC4180 quoting, so a name containing a comma survives. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function batchGameToCsv(game: BatchGame): string {
  return `${batchGameToRows(game)
    .map((row) => row.map(csvCell).join(","))
    .join("\n")}\n`;
}

/** An .xlsx whose single sheet is the same matrix (one cell per value, no formatting). */
export function batchGameToXlsx(game: BatchGame): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(batchGameToRows(game));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Box Score");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(bytes);
}
