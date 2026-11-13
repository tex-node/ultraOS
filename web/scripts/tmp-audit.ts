import { readFileSync } from "node:fs";

// Prompt 1 investigation: show the four inconsistent LBCL lines in full, with their team context, so the
// correction is chosen from evidence rather than guessed.
type P = Record<string, number | string | boolean | null>;
type Team = { clubName: string; players: P[]; totals: Record<string, number> };
type Game = { home: Team; away: Team; homeScore: number; awayScore: number; periods: { label: string; homeScore: number; awayScore: number }[]; sourceLabel: string; scheduledAt: string };

const batch = JSON.parse(readFileSync("scripts/data/lbcl-2026-batch1.json", "utf8")) as { games: Game[] };
const n = (v: unknown) => (typeof v === "number" ? v : 0);

for (const [index, game] of batch.games.entries()) {
  for (const [side, team] of [["home", game.home] as const, ["away", game.away] as const]) {
    const problems: string[] = [];
    let pointsSum = 0;
    for (const player of team.players) {
      const points = n(player.points);
      pointsSum += points;
      const derived = 2 * n(player.twoPointsMade) + 3 * n(player.threePointsMade) + n(player.freeThrowsMade);
      const derivedFga = n(player.twoPointsAttempted) + n(player.threePointsAttempted);
      const derivedFgm = n(player.twoPointsMade) + n(player.threePointsMade);
      const issues: string[] = [];
      if (points !== derived) issues.push(`points ${points} vs components ${derived}`);
      if (n(player.fieldGoalsAttempted) !== derivedFga) issues.push(`FGA ${n(player.fieldGoalsAttempted)} vs 2PA+3PA ${derivedFga}`);
      if (n(player.fieldGoalsMade) !== derivedFgm) issues.push(`FGM ${n(player.fieldGoalsMade)} vs 2PM+3PM ${derivedFgm}`);
      if (n(player.fieldGoalsMade) > n(player.fieldGoalsAttempted)) issues.push(`FGM > FGA`);
      if (issues.length > 0) {
        problems.push(`  ${String(player.fullName)}: ${issues.join(" | ")}`);
      }
    }
    const score = side === "home" ? game.homeScore : game.awayScore;
    const sumsMatch = pointsSum === score;
    if (problems.length > 0) {
      console.log(`game ${index + 1} (${game.sourceLabel}) - ${side} ${team.clubName}`);
      console.log(`  score=${score} playerPointsSum=${pointsSum} ${sumsMatch ? "MATCH" : "MISMATCH"}`);
      for (const problem of problems) console.log(problem);
      // The full offending rows and the printed team totals, for adjudication.
      for (const player of team.players) {
        const points = n(player.points);
        const derived = 2 * n(player.twoPointsMade) + 3 * n(player.threePointsMade) + n(player.freeThrowsMade);
        if (points !== derived || n(player.fieldGoalsAttempted) !== n(player.twoPointsAttempted) + n(player.threePointsAttempted)) {
          console.log(`  row: ${JSON.stringify({ name: player.fullName, pts: player.points, fgm: player.fieldGoalsMade, fga: player.fieldGoalsAttempted, tpm: player.twoPointsMade, tpa: player.twoPointsAttempted, thpm: player.threePointsMade, thpa: player.threePointsAttempted, ftm: player.freeThrowsMade, fta: player.freeThrowsAttempted, min: player.minutesPlayed, dnp: player.didNotPlay })}`);
        }
      }
      console.log(`  printed totals: ${JSON.stringify(team.totals)}`);
      console.log("");
    }
  }
}
