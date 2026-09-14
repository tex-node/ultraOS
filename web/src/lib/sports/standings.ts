// Multi-sport Stage 5 (S5.2): the standings engine. Pure functions only; no database access.
//
// One engine computes standings for any sport from its StandingsSpec: which outcomes exist, how
// league points are awarded, and the ordered tiebreak chain. Basketball output is verified against
// the legacy calculateStandings/compareStandings (see standings.test.ts) so Season Zero behaviour
// is unchanged.
//
// HEAD_TO_HEAD is deliberately not evaluated here - it needs the full pairwise results matrix and
// is deferred; the engine skips it in the chain rather than guessing.

import type { SportDefinition, StandingsPrimaryPoints } from "./types";

export type StandingsOutcomeOverride = "HOME_WIN" | "AWAY_WIN" | "DRAW" | "TIE" | "NO_RESULT";

export type StandingsResult = {
  homeEntrantId: string;
  awayEntrantId: string;
  homeScore: number;
  awayScore: number;
  outcome?: StandingsOutcomeOverride;
  secondary?: {
    home?: Record<string, number>;
    away?: Record<string, number>;
  };
};

export type StandingsEntrant = { entrantId: string; name: string };

export type StandingRow = {
  entrantId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  ties: number;
  noResult: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  leaguePoints: number;
  rank: number;
  rankTiebreak: string | null;
  secondary: Record<string, number>;
};

function initRow(entrant: StandingsEntrant): StandingRow {
  return {
    entrantId: entrant.entrantId,
    name: entrant.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    ties: 0,
    noResult: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDifference: 0,
    leaguePoints: 0,
    rank: 0,
    rankTiebreak: null,
    secondary: {},
  };
}

function addSecondary(target: Record<string, number>, source?: Record<string, number>) {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function resolveOutcome(definition: SportDefinition, result: StandingsResult): "HOME_WIN" | "AWAY_WIN" | "DRAW" | "TIE" | "NO_RESULT" | "NONE" {
  if (result.outcome) return result.outcome;
  if (result.homeScore > result.awayScore) return "HOME_WIN";
  if (result.awayScore > result.homeScore) return "AWAY_WIN";
  // Equal score: a real draw when the sport allows it, otherwise no decision (matches the legacy
  // basketball behaviour where a null winner increments neither won nor lost).
  return definition.scoring.drawsAllowed ? "DRAW" : "NONE";
}

function applyPoints(
  primary: StandingsPrimaryPoints,
  outcome: "HOME_WIN" | "AWAY_WIN" | "DRAW" | "TIE" | "NO_RESULT" | "NONE",
  home: StandingRow,
  away: StandingRow,
  result: StandingsResult,
) {
  switch (primary.model) {
    case "WIN_DRAW_LOSS": {
      if (outcome === "HOME_WIN") {
        home.leaguePoints += primary.win;
        away.leaguePoints += primary.loss;
      } else if (outcome === "AWAY_WIN") {
        away.leaguePoints += primary.win;
        home.leaguePoints += primary.loss;
      } else if (outcome === "DRAW") {
        home.leaguePoints += primary.draw;
        away.leaguePoints += primary.draw;
      } else if (outcome === "NO_RESULT") {
        const points = primary.noResult ?? primary.draw;
        home.leaguePoints += points;
        away.leaguePoints += points;
      }
      return;
    }
    case "VOLLEYBALL_SETS": {
      if (outcome !== "HOME_WIN" && outcome !== "AWAY_WIN") {
        home.leaguePoints += outcome === "NO_RESULT" ? 0 : 0;
        return;
      }
      const winner = outcome === "HOME_WIN" ? home : away;
      const loser = outcome === "HOME_WIN" ? away : home;
      // Five-set determination uses THIS match's set score, not the accumulated row totals.
      const loserMatchSets = (outcome === "HOME_WIN" ? result.secondary?.away : result.secondary?.home)?.SETS_WON;
      const wentFive = typeof loserMatchSets === "number" && loserMatchSets === 2;
      winner.leaguePoints += wentFive ? primary.winFive : primary.winSweep;
      loser.leaguePoints += wentFive ? primary.lossFive : primary.lossSweep;
      return;
    }
    case "CRICKET": {
      if (outcome === "HOME_WIN" || outcome === "AWAY_WIN") {
        const winner = outcome === "HOME_WIN" ? home : away;
        const loser = outcome === "HOME_WIN" ? away : home;
        winner.leaguePoints += primary.win;
        loser.leaguePoints += 0;
      } else if (outcome === "TIE") {
        home.leaguePoints += primary.tie;
        away.leaguePoints += primary.tie;
      } else if (outcome === "NO_RESULT") {
        home.leaguePoints += primary.noResult;
        away.leaguePoints += primary.noResult;
      } else if (outcome === "DRAW") {
        home.leaguePoints += primary.draw;
        away.leaguePoints += primary.draw;
      }
      return;
    }
  }
}

export function computeStandings(
  definition: SportDefinition,
  entrants: StandingsEntrant[],
  results: StandingsResult[],
): StandingRow[] {
  const rows = new Map(entrants.map((entrant) => [entrant.entrantId, initRow(entrant)]));

  for (const result of results) {
    const home = rows.get(result.homeEntrantId);
    const away = rows.get(result.awayEntrantId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.pointsFor += result.homeScore;
    home.pointsAgainst += result.awayScore;
    away.pointsFor += result.awayScore;
    away.pointsAgainst += result.homeScore;
    addSecondary(home.secondary, result.secondary?.home);
    addSecondary(away.secondary, result.secondary?.away);

    const outcome = resolveOutcome(definition, result);
    if (outcome === "HOME_WIN") {
      home.won += 1;
      away.lost += 1;
    } else if (outcome === "AWAY_WIN") {
      away.won += 1;
      home.lost += 1;
    } else if (outcome === "DRAW") {
      home.drawn += 1;
      away.drawn += 1;
    } else if (outcome === "TIE") {
      home.ties += 1;
      away.ties += 1;
    } else if (outcome === "NO_RESULT") {
      home.noResult += 1;
      away.noResult += 1;
    }

    applyPoints(definition.standings.primaryPoints, outcome, home, away, result);
  }

  for (const row of rows.values()) {
    row.pointDifference = row.pointsFor - row.pointsAgainst;
    finalizeSecondary(row);
  }

  const sorted = rankStandingRows(definition, [...rows.values()]);
  return sorted;
}

// Sorts rows by the sport's tiebreak chain and assigns rank + the deciding tiebreak key. Exported
// so the Stage 5 backfill/parity tooling can rank stored standings without recomputing results.
export function rankStandingRows(definition: SportDefinition, rows: StandingRow[]): StandingRow[] {
  const sorted = [...rows].sort((a, b) => compareStandingRows(definition, a, b));
  sorted.forEach((row, index) => {
    row.rank = index + 1;
    if (index === 0) {
      row.rankTiebreak = null;
      return;
    }
    const previous = sorted[index - 1];
    const decidingKey = definition.standings.tiebreak.find((key) => {
      if (key === "NAME" || key === "HEAD_TO_HEAD") return false;
      return tiebreakValue(row, key) !== tiebreakValue(previous, key);
    });
    row.rankTiebreak = decidingKey ?? null;
  });
  return sorted;
}

function finalizeSecondary(row: StandingRow) {
  const s = row.secondary;
  if (typeof s.SETS_WON === "number" && typeof s.SETS_LOST === "number" && s.SETS_LOST > 0) {
    s.SET_RATIO = s.SETS_WON / s.SETS_LOST;
  }
  if (typeof s.POINTS_WON === "number" && typeof s.POINTS_LOST === "number" && s.POINTS_LOST > 0) {
    s.POINT_RATIO = s.POINTS_WON / s.POINTS_LOST;
  }
  if (typeof s.GAMES_WON === "number" && typeof s.GAMES_LOST === "number" && s.GAMES_LOST > 0) {
    s.GAME_RATIO = s.GAMES_WON / s.GAMES_LOST;
  }
  if (
    typeof s.RUNS_FOR === "number" &&
    typeof s.OVERS_FACED === "number" &&
    typeof s.RUNS_AGAINST === "number" &&
    typeof s.OVERS_BOWLED === "number" &&
    s.OVERS_FACED > 0 &&
    s.OVERS_BOWLED > 0
  ) {
    s.NET_RUN_RATE = s.RUNS_FOR / s.OVERS_FACED - s.RUNS_AGAINST / s.OVERS_BOWLED;
  }
}

function tiebreakValue(row: StandingRow, key: string): number {
  switch (key) {
    case "LEAGUE_POINTS":
      return row.leaguePoints;
    case "WINS":
      return row.won;
    case "POINT_DIFFERENCE":
    case "GOAL_DIFFERENCE":
      return row.pointDifference;
    case "POINTS_FOR":
    case "GOALS_FOR":
      return row.pointsFor;
    case "SET_RATIO":
      return row.secondary.SET_RATIO ?? 0;
    case "POINT_RATIO":
      return row.secondary.POINT_RATIO ?? 0;
    case "GAME_RATIO":
      return row.secondary.GAME_RATIO ?? 0;
    case "NET_RUN_RATE":
      return row.secondary.NET_RUN_RATE ?? 0;
    default:
      return 0;
  }
}

export function compareStandingRows(definition: SportDefinition, a: StandingRow, b: StandingRow): number {
  for (const key of definition.standings.tiebreak) {
    if (key === "NAME") return a.name.localeCompare(b.name);
    if (key === "HEAD_TO_HEAD") continue;
    const difference = tiebreakValue(b, key) - tiebreakValue(a, key);
    if (difference !== 0) return difference;
  }
  return a.name.localeCompare(b.name);
}
