import type { GameCore } from "./types";

// Deterministic Season Zero story cards. Every card is a direct min/max over real persisted
// numbers and links back to the exact game it came from — nothing here is generated prose,
// and every statement is reproducible by re-running the same reduction over GameCore[].

export type SeasonStoryCard = {
  key: string;
  title: string;
  value: string;
  detail: string;
  fixtureId: string;
};

function margin(g: GameCore): number {
  return Math.abs(g.home.score - g.away.score);
}

function matchup(g: GameCore): string {
  return `${g.home.shortName} ${g.home.score} – ${g.away.score} ${g.away.shortName}`;
}

export function buildSeasonStoryCards(games: GameCore[]): SeasonStoryCard[] {
  if (games.length === 0) return [];
  const cards: SeasonStoryCard[] = [];

  const decided = games.filter((g) => margin(g) > 0);
  if (decided.length > 0) {
    const closest = [...decided].sort((a, b) => margin(a) - margin(b))[0];
    cards.push({ key: "CLOSEST_FINISH", title: "Closest Finish", value: `${margin(closest)} pt margin`, detail: matchup(closest), fixtureId: closest.fixtureId });

    const biggest = [...decided].sort((a, b) => margin(b) - margin(a))[0];
    cards.push({ key: "BIGGEST_WIN", title: "Biggest Win", value: `${margin(biggest)} pts`, detail: matchup(biggest), fixtureId: biggest.fixtureId });
  }

  const highest = [...games].sort((a, b) => (b.home.score + b.away.score) - (a.home.score + a.away.score))[0];
  cards.push({ key: "HIGHEST_SCORING_GAME", title: "Highest-Scoring Game", value: `${highest.home.score + highest.away.score} pts`, detail: matchup(highest), fixtureId: highest.fixtureId });

  const overtimeGames = games.filter((g) => g.periods.some((p) => /^OT/i.test(p.label)));
  if (overtimeGames.length > 0) {
    const ot = overtimeGames[0];
    cards.push({ key: "OVERTIME_CLASSIC", title: "Overtime Classic", value: matchup(ot), detail: `${overtimeGames.length} overtime game${overtimeGames.length === 1 ? "" : "s"} this season`, fixtureId: ot.fixtureId });
  }

  let topScorer: { points: number; name: string; game: GameCore } | null = null;
  for (const g of games) {
    for (const p of g.players) {
      if (!topScorer || p.points > topScorer.points) topScorer = { points: p.points, name: p.name, game: g };
    }
  }
  if (topScorer) {
    cards.push({ key: "TOP_INDIVIDUAL_SCORING_GAME", title: "Top Individual Scoring Game", value: `${topScorer.points} PTS`, detail: `${topScorer.name} · ${matchup(topScorer.game)}`, fixtureId: topScorer.game.fixtureId });
  }

  let bestShooting: { pct: number; side: GameCore["home"]; game: GameCore } | null = null;
  for (const g of games) {
    for (const side of [g.home, g.away]) {
      if (side.fieldGoalsMade == null || !side.fieldGoalsAttempted) continue;
      const pct = (side.fieldGoalsMade / side.fieldGoalsAttempted) * 100;
      if (!bestShooting || pct > bestShooting.pct) bestShooting = { pct, side, game: g };
    }
  }
  if (bestShooting) {
    cards.push({ key: "BEST_TEAM_SHOOTING_PERFORMANCE", title: "Best Team Shooting Performance", value: `${bestShooting.pct.toFixed(1)}%`, detail: `${bestShooting.side.shortName} · ${matchup(bestShooting.game)}`, fixtureId: bestShooting.game.fixtureId });
  }

  let reboundEdge: { margin: number; winnerSide: string; game: GameCore } | null = null;
  for (const g of games) {
    const home = g.home.offensiveRebounds != null && g.home.defensiveRebounds != null ? g.home.offensiveRebounds + g.home.defensiveRebounds : null;
    const away = g.away.offensiveRebounds != null && g.away.defensiveRebounds != null ? g.away.offensiveRebounds + g.away.defensiveRebounds : null;
    if (home == null || away == null) continue;
    const gap = Math.abs(home - away);
    if (!reboundEdge || gap > reboundEdge.margin) reboundEdge = { margin: gap, winnerSide: home >= away ? g.home.shortName : g.away.shortName, game: g };
  }
  if (reboundEdge && reboundEdge.margin > 0) {
    cards.push({ key: "BIGGEST_REBOUNDING_EDGE", title: "Biggest Rebounding Edge", value: `+${reboundEdge.margin} REB`, detail: `${reboundEdge.winnerSide} · ${matchup(reboundEdge.game)}`, fixtureId: reboundEdge.game.fixtureId });
  }

  let assistEdge: { margin: number; winnerSide: string; game: GameCore } | null = null;
  for (const g of games) {
    const gap = Math.abs(g.home.assists - g.away.assists);
    if (!assistEdge || gap > assistEdge.margin) assistEdge = { margin: gap, winnerSide: g.home.assists >= g.away.assists ? g.home.shortName : g.away.shortName, game: g };
  }
  if (assistEdge && assistEdge.margin > 0) {
    cards.push({ key: "BIGGEST_ASSIST_EDGE", title: "Biggest Assist Edge", value: `+${assistEdge.margin} AST`, detail: `${assistEdge.winnerSide} · ${matchup(assistEdge.game)}`, fixtureId: assistEdge.game.fixtureId });
  }

  let benchBest: { points: number; side: string; game: GameCore } | null = null;
  for (const g of games) {
    for (const side of [g.home, g.away]) {
      if (side.benchPoints == null) continue;
      if (!benchBest || side.benchPoints > benchBest.points) benchBest = { points: side.benchPoints, side: side.shortName, game: g };
    }
  }
  if (benchBest && benchBest.points > 0) {
    cards.push({ key: "STRONGEST_BENCH_PERFORMANCE", title: "Strongest Bench Performance", value: `${benchBest.points} PTS`, detail: `${benchBest.side} · ${matchup(benchBest.game)}`, fixtureId: benchBest.game.fixtureId });
  }

  let paintBest: { points: number; side: string; game: GameCore } | null = null;
  for (const g of games) {
    for (const side of [g.home, g.away]) {
      if (side.pointsInPaint == null) continue;
      if (!paintBest || side.pointsInPaint > paintBest.points) paintBest = { points: side.pointsInPaint, side: side.shortName, game: g };
    }
  }
  if (paintBest && paintBest.points > 0) {
    cards.push({ key: "STRONGEST_PAINT_PERFORMANCE", title: "Strongest Paint Performance", value: `${paintBest.points} PTS`, detail: `${paintBest.side} · ${matchup(paintBest.game)}`, fixtureId: paintBest.game.fixtureId });
  }

  return cards;
}
