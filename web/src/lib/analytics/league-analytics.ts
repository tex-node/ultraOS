import { qualificationConfig } from "./config";
import { formatPercent, percent, round1 } from "./normalization";
import { isShootingQualified, playerSampleQualification } from "./qualification";
import type { GameCore, QualificationState } from "./types";

export type LeaguePulseCard = { key: string; label: string; value: string; detail?: string };

export function buildLeaguePulse(games: GameCore[]): LeaguePulseCard[] {
  if (games.length === 0) return [];
  const totalPoints = games.reduce((sum, g) => sum + g.home.score + g.away.score, 0);
  const cards: LeaguePulseCard[] = [
    { key: "gamesPlayed", label: "Games Played", value: String(games.length) },
    { key: "totalPoints", label: "Total Points Scored", value: String(totalPoints) },
    { key: "avgGameScore", label: "Average Game Score", value: round1(totalPoints / games.length).toFixed(1) },
  ];

  const highest = [...games].sort((a, b) => (b.home.score + b.away.score) - (a.home.score + a.away.score))[0];
  cards.push({
    key: "highestScoring",
    label: "Highest Scoring Game",
    value: `${highest.home.score + highest.away.score} pts`,
    detail: `${highest.home.shortName} ${highest.home.score} – ${highest.away.score} ${highest.away.shortName}`,
  });

  const closest = [...games].sort((a, b) => Math.abs(a.home.score - a.away.score) - Math.abs(b.home.score - b.away.score))[0];
  cards.push({
    key: "closestGame",
    label: "Closest Game",
    value: `${Math.abs(closest.home.score - closest.away.score)} pt margin`,
    detail: `${closest.home.shortName} ${closest.home.score} – ${closest.away.score} ${closest.away.shortName}`,
  });

  const biggestWin = [...games].sort((a, b) => Math.abs(b.home.score - b.away.score) - Math.abs(a.home.score - a.away.score))[0];
  cards.push({
    key: "biggestWin",
    label: "Biggest Win",
    value: `${Math.abs(biggestWin.home.score - biggestWin.away.score)} pts`,
    detail: `${biggestWin.home.shortName} ${biggestWin.home.score} – ${biggestWin.away.score} ${biggestWin.away.shortName}`,
  });

  const otGames = games.filter((g) => g.periods.some((p) => /^OT/i.test(p.label)));
  if (otGames.length > 0) cards.push({ key: "otGames", label: "Overtime Games", value: String(otGames.length) });

  const leadChangeGames = games.filter((g) => g.home.leadChanges != null);
  if (leadChangeGames.length > 0) {
    const most = [...leadChangeGames].sort((a, b) => (b.home.leadChanges ?? 0) - (a.home.leadChanges ?? 0))[0];
    cards.push({
      key: "mostLeadChanges",
      label: "Most Lead Changes",
      value: String(most.home.leadChanges),
      detail: `${most.home.shortName} vs ${most.away.shortName}`,
    });
  }

  const runGames = games.filter((g) => g.home.biggestScoringRun != null || g.away.biggestScoringRun != null);
  if (runGames.length > 0) {
    let bestTeam = "";
    let bestRun = -1;
    let bestGame: GameCore | null = null;
    for (const g of runGames) {
      if ((g.home.biggestScoringRun ?? -1) > bestRun) { bestRun = g.home.biggestScoringRun ?? -1; bestTeam = g.home.shortName; bestGame = g; }
      if ((g.away.biggestScoringRun ?? -1) > bestRun) { bestRun = g.away.biggestScoringRun ?? -1; bestTeam = g.away.shortName; bestGame = g; }
    }
    if (bestGame) cards.push({ key: "biggestRun", label: "Biggest Scoring Run", value: `${bestRun} pts`, detail: `${bestTeam} vs ${bestGame.home.shortName === bestTeam ? bestGame.away.shortName : bestGame.home.shortName}` });
  }

  let bestFgPct = -1;
  let bestFgTeam = "";
  for (const g of games) {
    for (const side of [g.home, g.away]) {
      const pct = percent(side.fieldGoalsMade, side.fieldGoalsAttempted);
      if (pct != null && pct > bestFgPct) { bestFgPct = pct; bestFgTeam = side.shortName; }
    }
  }
  if (bestFgPct >= 0) cards.push({ key: "bestTeamFgPct", label: "Best Team FG%", value: formatPercent(bestFgPct), detail: bestFgTeam });

  let topScorer = { name: "", value: -1, detail: "" };
  let topEff = { name: "", value: -1, detail: "" };
  let topRebounder = { name: "", value: -1, detail: "" };
  let topAssister = { name: "", value: -1, detail: "" };
  for (const g of games) {
    for (const p of g.players) {
      if (p.points > topScorer.value) topScorer = { name: p.name, value: p.points, detail: `${p.points} PTS · ${p.seasonClubShortName}` };
      const eff = p.efficiency ?? p.points + p.rebounds + p.assists;
      if (eff > topEff.value) topEff = { name: p.name, value: eff, detail: `${eff} EFF · ${p.seasonClubShortName}` };
      if (p.rebounds > topRebounder.value) topRebounder = { name: p.name, value: p.rebounds, detail: `${p.rebounds} REB · ${p.seasonClubShortName}` };
      if (p.assists > topAssister.value) topAssister = { name: p.name, value: p.assists, detail: `${p.assists} AST · ${p.seasonClubShortName}` };
    }
  }
  if (topScorer.value >= 0) cards.push({ key: "topScoring", label: "Top Scoring Performance", value: topScorer.name, detail: topScorer.detail });
  if (topEff.value >= 0) cards.push({ key: "topEfficiency", label: "Top Efficiency Performance", value: topEff.name, detail: topEff.detail });
  if (topRebounder.value >= 0) cards.push({ key: "topRebounding", label: "Top Rebounding Performance", value: topRebounder.name, detail: topRebounder.detail });
  if (topAssister.value >= 0) cards.push({ key: "topAssists", label: "Top Assist Performance", value: topAssister.name, detail: topAssister.detail });

  return cards;
}

export type SeasonPlayerTotals = {
  playerId: string;
  athleteId: string;
  name: string;
  seasonClubShortName: string;
  gamesPlayed: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  twoPointsMade: number;
  twoPointsAttempted: number;
  threePointsMade: number;
  threePointsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  plusMinus: number;
};

export type LeaderboardEntry = {
  playerId: string;
  name: string;
  seasonClubShortName: string;
  value: string;
  rawValue: number;
  qualification: QualificationState;
};

function perGame(total: number, games: number): number {
  return games > 0 ? total / games : 0;
}

export function buildPlayerLeaderboard(
  players: SeasonPlayerTotals[],
  category: "PPG" | "RPG" | "APG" | "SPG" | "BPG" | "FG_PCT" | "THREE_PCT" | "FT_PCT" | "PLUS_MINUS" | "DEF_ACTIVITY" | "EFF",
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (const p of players) {
    const qualification = playerSampleQualification(p.gamesPlayed);
    // A ranked leaderboard only shows fully QUALIFIED entries — DEVELOPING_PROFILE is a real,
    // useful state elsewhere (a player's own DNA/profile page), but ranking a 1-game outlier
    // above a 2-game averaged leader is exactly the "don't rank a 1/1 shooter" problem the spec
    // calls out, generalized from attempts to games played.
    if (qualification !== "QUALIFIED") continue;
    let rawValue: number | null = null;
    let display = "";
    switch (category) {
      case "PPG": rawValue = round1(perGame(p.points, p.gamesPlayed)); display = rawValue.toFixed(1); break;
      case "RPG": rawValue = round1(perGame(p.rebounds, p.gamesPlayed)); display = rawValue.toFixed(1); break;
      case "APG": rawValue = round1(perGame(p.assists, p.gamesPlayed)); display = rawValue.toFixed(1); break;
      case "SPG": rawValue = round1(perGame(p.steals, p.gamesPlayed)); display = rawValue.toFixed(1); break;
      case "BPG": rawValue = round1(perGame(p.blocks, p.gamesPlayed)); display = rawValue.toFixed(1); break;
      case "PLUS_MINUS": rawValue = p.plusMinus; display = rawValue > 0 ? `+${rawValue}` : String(rawValue); break;
      case "DEF_ACTIVITY": rawValue = round1(perGame(p.steals + p.blocks, p.gamesPlayed)); display = rawValue.toFixed(1); break;
      case "EFF": {
        const missedFg = Math.max(0, p.fieldGoalsAttempted - p.fieldGoalsMade);
        const missedFt = Math.max(0, p.freeThrowsAttempted - p.freeThrowsMade);
        const eff = p.points + p.rebounds + p.assists + p.steals + p.blocks - missedFg - missedFt - p.turnovers;
        rawValue = round1(perGame(eff, p.gamesPlayed));
        display = rawValue.toFixed(1);
        break;
      }
      case "FG_PCT":
        if (!isShootingQualified(p.fieldGoalsAttempted)) continue;
        rawValue = percent(p.fieldGoalsMade, p.fieldGoalsAttempted);
        display = formatPercent(rawValue);
        break;
      case "THREE_PCT":
        if (!isShootingQualified(p.threePointsAttempted)) continue;
        rawValue = percent(p.threePointsMade, p.threePointsAttempted);
        display = formatPercent(rawValue);
        break;
      case "FT_PCT":
        if (!isShootingQualified(p.freeThrowsAttempted)) continue;
        rawValue = percent(p.freeThrowsMade, p.freeThrowsAttempted);
        display = formatPercent(rawValue);
        break;
    }
    if (rawValue == null) continue;
    entries.push({ playerId: p.playerId, name: p.name, seasonClubShortName: p.seasonClubShortName, value: display, rawValue, qualification });
  }
  return entries.sort((a, b) => b.rawValue - a.rawValue).slice(0, 10);
}

export const LEADERBOARD_MIN_ATTEMPTS_NOTE = `Minimum ${qualificationConfig.shootingMinimumAttempts} attempts required for shooting leaderboards; minimum ${qualificationConfig.playerMinimumGamesForLeaderboard} games played for counting-stat leaderboards.`;
