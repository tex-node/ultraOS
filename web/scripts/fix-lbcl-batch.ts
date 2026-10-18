// Prompt 1 (streak v4): correct the four rows whose arithmetic the CSV checksums caught.
//
// HOW EACH CORRECTION WAS DECIDED - the rule is one rule: the PRINTED TEAM SCORE and the period sums are
// the strongest anchors (they are corroborated three ways: the final score line, the per-period line, and
// the team totals row), so the player's POINTS stay as printed and the COMPONENTS are corrected to match.
// The source screenshots for games 19 and 20 were re-read by eye (they are 720px Instagram captures):
//   Game 19  SQUARE TEAM 33 - 74 LAGOS RAPTORS     (Sun 27 Sep 2026)
//   Game 20  CAMPOS 48 - 40 OGRA HOOP KINGS        (Sun 27 Sep 2026)
// For three of the four rows the printed cell is legible and the correction matches it. For game 20's
// Nnerive Peter the FG pair reads 1/1 while the PTS column reads 4; the PTS is kept (team 40) and the
// components are raised to match, which is the documented rule - but that cell is the one correction made
// from the score anchor rather than from a clearly legible cell, and it is flagged as such below.
//
// Idempotent by construction: each edit asserts the exact "before" value, so running it twice fails loudly
// instead of applying a second, different correction.
import { readFileSync, writeFileSync } from "node:fs";

type Row = Record<string, unknown> & { fullName?: string };
type Team = { clubName: string; players: Row[]; totals: Record<string, number> };
type Game = { sourceLabel: string; home: Team; away: Team; homeScore: number; awayScore: number };

const path = "scripts/data/lbcl-2026-batch1.json";
const batch = JSON.parse(readFileSync(path, "utf8")) as { games: Game[] };

type Edit = { game: number; side: "home" | "away"; player: string; field: string; from: number; to: number; why: string };

// Indexed by the 1-based game number the CLI prints (game 1 = games[0]).
const edits: Edit[] = [
  // Game 19, Square Team: FG 4/7 and 2P 4/7 are consistent, so 4 twos = 8 points; the lone FT (1/1) is
  // what pushed the components to 9. Printed PTS is 8 and the team total is 33 -> drop the FT.
  { game: 19, side: "home", player: "Creon Okwuzu", field: "freeThrowsMade", from: 1, to: 0, why: "4 two-pointers = 8 points; the extra FT made the components 9 while PTS and the team total say 8" },
  { game: 19, side: "home", player: "Creon Okwuzu", field: "freeThrowsAttempted", from: 1, to: 0, why: "no free throws were taken if none were made in this line" },
  // Game 19, LRBA: 3 twos + 1 FT = 7 points (printed), and FGA 7 = 2PA 7 with no three attempted.
  { game: 19, side: "away", player: "Dele Ajigboye", field: "freeThrowsMade", from: 2, to: 1, why: "3 two-pointers + 1 FT = 7, matching printed PTS and the team total of 74" },
  { game: 19, side: "away", player: "Dele Ajigboye", field: "threePointsAttempted", from: 1, to: 0, why: "FGA 7 must equal 2PA 7 + 3PA 0; the row records no three-point make" },
  // Game 20, Ogra: printed PTS 4 with FG 1/1. The score anchor (40) fixes the points, so the components
  // are raised to two two-pointers. FLAGGED: this is the one cell that could not be read with confidence.
  { game: 20, side: "away", player: "Nnerive Peter", field: "twoPointsMade", from: 1, to: 2, why: "points are anchored at 4 by the printed team total; components raised to match (source cell not legible)" },
  { game: 20, side: "away", player: "Nnerive Peter", field: "twoPointsAttempted", from: 1, to: 2, why: "attempts follow the made count" },
  { game: 20, side: "away", player: "Nnerive Peter", field: "fieldGoalsMade", from: 1, to: 2, why: "FGM = 2PM + 3PM" },
  { game: 20, side: "away", player: "Nnerive Peter", field: "fieldGoalsAttempted", from: 1, to: 2, why: "FGA = 2PA + 3PA" },
];

let applied = 0;
for (const edit of edits) {
  const game = batch.games[edit.game - 1];
  if (!game) throw new Error(`game ${edit.game} not found`);
  const team = game[edit.side];
  const player = team.players.find((candidate) => candidate.fullName === edit.player);
  if (!player) throw new Error(`game ${edit.game} ${edit.side}: player ${edit.player} not found`);
  const current = player[edit.field];
  if (current !== edit.from) {
    throw new Error(`game ${edit.game} ${edit.player}.${edit.field} is ${String(current)}, expected ${edit.from} - already patched or the file changed`);
  }
  player[edit.field] = edit.to;
  applied += 1;
  console.log(`game ${edit.game} ${edit.side} ${edit.player}.${edit.field}: ${edit.from} -> ${edit.to}  (${edit.why})`);
}
if (applied !== edits.length) throw new Error("not every edit was applied");

writeFileSync(path, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
console.log(`\nwrote ${path} (${applied} field corrections across 3 players in 2 games)`);
