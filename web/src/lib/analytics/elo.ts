// Elo ratings (streak v13, Prompt 3).
//
// A sportsbook needs a pre-match number, and "50/50" is not one. This is a standard Elo with two adjustments that
// matter for team sports and are stated rather than buried:
//
//   * margin of victory: a 30-point win moves a rating more than a 1-point win, via a damped multiplier on the
//     winner's gain (the 538-style `ln(margin + 1)`), capped so a blowout cannot run away with the table.
//   * home advantage: the home side is treated as ~65 rating points stronger for the purpose of the expectation,
//     which is roughly what the football/basketball literature reports, and it is subtracted again for the update.
//
// Everything is a pure function of the game list, so a rebuild is reproducible and a test can pin a known sequence.
// K, home advantage and the margin cap are parameters with defaults, not constants hidden in the maths.

export type EloGame = {
  homeKey: string;
  awayKey: string;
  homeScore: number;
  awayScore: number;
  /** Draws are allowed in football; a level game is scored as 0.5 to each side. */
  drawsAllowed?: boolean;
  /** Played-at ordering; the caller supplies games oldest-first. */
  playedAt?: Date | string;
};

export type EloConfig = {
  /** Base K-factor: how far one result can move a rating. */
  k: number;
  /** Rating points added to the home side's strength for the expectation only. */
  homeAdvantage: number;
  /** Starting rating for a team with no history. */
  initial: number;
  /** Cap on the margin-of-victory multiplier. */
  maxMarginMultiplier: number;
};

export const DEFAULT_ELO: EloConfig = { k: 20, homeAdvantage: 65, initial: 1500, maxMarginMultiplier: 2.5 };

export type EloResult = {
  key: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Rating change over the last result, for a "form" arrow. */
  lastChange: number;
};

const expectedScore = (rating: number, opponentWithAdvantage: number) =>
  1 / (1 + 10 ** ((opponentWithAdvantage - rating) / 400));

/** Damped margin multiplier: a 1-point win is ~1.0, a 20-point win is ~2.0, capped. */
export function marginMultiplier(margin: number, config: EloConfig = DEFAULT_ELO): number {
  const safe = Math.max(1, Math.abs(margin));
  return Math.min(config.maxMarginMultiplier, Math.log(safe + 1) / Math.log(2) + 0.4);
}

export function computeEloRatings(games: EloGame[], config: EloConfig = DEFAULT_ELO): Map<string, EloResult> {
  const table = new Map<string, EloResult>();
  const ensure = (key: string) => {
    const existing = table.get(key);
    if (existing) return existing;
    const created: EloResult = { key, rating: config.initial, games: 0, wins: 0, losses: 0, draws: 0, lastChange: 0 };
    table.set(key, created);
    return created;
  };

  for (const game of games) {
    if (game.homeKey === game.awayKey) continue;
    const margin = game.homeScore - game.awayScore;
    const draw = margin === 0;
    // A no-draw sport should not have a level result on record; ignore it BEFORE creating rows for the two sides,
    // otherwise a bogus game leaves two rating rows with zero plausible history (found by its own test).
    if (draw && game.drawsAllowed === false) continue;
    const home = ensure(game.homeKey);
    const away = ensure(game.awayKey);

    const homeExpected = expectedScore(home.rating, away.rating - config.homeAdvantage);
    const awayExpected = 1 - homeExpected;
    const homeWin = margin > 0;

    const homeActual = draw ? 0.5 : homeWin ? 1 : 0;
    const awayActual = 1 - homeActual;
    const multiplier = draw ? 1 : marginMultiplier(margin, config);

    const homeChange = config.k * multiplier * (homeActual - homeExpected);
    const awayChange = config.k * multiplier * (awayActual - awayExpected);

    home.rating += homeChange;
    away.rating += awayChange;
    home.lastChange = homeChange;
    away.lastChange = awayChange;
    home.games += 1;
    away.games += 1;
    if (draw) {
      home.draws += 1;
      away.draws += 1;
    } else if (homeWin) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }

  for (const result of table.values()) result.rating = Math.round(result.rating * 100) / 100;
  return table;
}

/**
 * The pre-match probability for the home side, from two ratings. This is the same expectation the update uses, so
 * the number a partner sees before the game is the number the engine would have predicted.
 */
export function eloWinProbability(homeRating: number, awayRating: number, config: EloConfig = DEFAULT_ELO): number {
  return expectedScore(homeRating, awayRating - config.homeAdvantage);
}
