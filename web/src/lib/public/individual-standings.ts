// Public standings for INDIVIDUAL sports (streak v6, Prompt 3). Pure functions only.
//
// The engine already ranks entrants (wins, then set ratio, then game ratio) and stores that rank with the
// tiebreak key that decided it, so this module does not re-rank: it presents what the engine decided, and
// derives the one thing the Standing row does not carry - GAMES - from the per-set scores.
//
// That split matters for honesty: sets come from the engine's own StandingMetric rows, games come from
// GamePeriodScore (the sets of a tennis match are its periods, and each period's score IS the games), and
// nothing is inferred from a scoreline that was never captured.

export type StandingMetricRow = { metricKey: string; value: number };

export type IndividualStandingInput = {
  entrantId: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  leaguePoints: number;
  rank: number | null;
  rankTiebreak: string | null;
  metrics: StandingMetricRow[];
  /** Sum of this entrant's per-set/period scores across FINAL matches. */
  gamesWon: number;
  gamesLost: number;
};

export type IndividualStandingRow = {
  entrantId: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  /** Match-win percentage, 0 when nothing played. */
  winRatio: number;
  setsWon: number;
  setsLost: number;
  setRatio: number | null;
  gamesWon: number;
  gamesLost: number;
  gameRatio: number | null;
  rank: number | null;
  /** The tiebreak the engine used to separate this row from the one above, when it did. */
  rankTiebreak: string | null;
};

function metricValue(metrics: StandingMetricRow[], key: string): number {
  return metrics.find((metric) => metric.metricKey === key)?.value ?? 0;
}

/** A ratio of 0/0 is not "0" - it is "no data", and the table renders it as a dash. */
function ratio(forValue: number, againstValue: number): number | null {
  if (forValue === 0 && againstValue === 0) return null;
  if (againstValue === 0) return null; // undefeated with no sets against: a dash is more honest than Infinity
  return forValue / againstValue;
}

export function buildIndividualStandings(rows: IndividualStandingInput[]): IndividualStandingRow[] {
  const built = rows.map((row) => {
    const setsWon = metricValue(row.metrics, "SETS_WON");
    const setsLost = metricValue(row.metrics, "SETS_LOST");
    return {
      entrantId: row.entrantId,
      name: row.name,
      played: row.played,
      won: row.won,
      lost: row.lost,
      winRatio: row.played === 0 ? 0 : row.won / row.played,
      setsWon,
      setsLost,
      setRatio: ratio(setsWon, setsLost),
      gamesWon: row.gamesWon,
      gamesLost: row.gamesLost,
      gameRatio: ratio(row.gamesWon, row.gamesLost),
      rank: row.rank,
      rankTiebreak: row.rankTiebreak,
    };
  });

  // The engine's rank is authoritative when present. Ties (null rank, e.g. a season never recalculated)
  // fall back to the same order the engine uses, so the table is never arbitrary.
  return built.sort((a, b) => {
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank;
    if (b.won !== a.won) return b.won - a.won;
    const aSet = a.setRatio ?? -1;
    const bSet = b.setRatio ?? -1;
    if (bSet !== aSet) return bSet - aSet;
    const aGame = a.gameRatio ?? -1;
    const bGame = b.gameRatio ?? -1;
    if (bGame !== aGame) return bGame - aGame;
    return a.name.localeCompare(b.name);
  });
}

/** "1.250" or "-" - never "Infinity", never "0.000" for an unplayed row. */
export function formatRatio(value: number | null): string {
  return value === null ? "–" : value.toFixed(3);
}
