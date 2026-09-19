// Scoreboard verification: the "does the app match the building?" check.
//
// During a timeout or stoppage the statistician reads the venue scoreboard and confirms the
// in-app score against it. Three numbers meet here: the official score (Fixture, written by the
// scorer console), the statistician's independently derived score (their own ledger), and the
// venue board (typed in from what the building shows). Pure comparison only; persistence lives
// in the verifyScoreboard action as a NOTE/SCORE_VERIFIED ledger event.

export type ScorePair = { home: number; away: number };

export type ScoreComparison = {
  officialMatchesStatistician: boolean;
  officialMatchesVenue: boolean;
  statisticianMatchesVenue: boolean;
  allMatch: boolean;
};

export function compareScores(official: ScorePair, statistician: ScorePair, venue: ScorePair): ScoreComparison {
  const officialMatchesStatistician = official.home === statistician.home && official.away === statistician.away;
  const officialMatchesVenue = official.home === venue.home && official.away === venue.away;
  const statisticianMatchesVenue = statistician.home === venue.home && statistician.away === venue.away;
  return {
    officialMatchesStatistician,
    officialMatchesVenue,
    statisticianMatchesVenue,
    allMatch: officialMatchesStatistician && officialMatchesVenue,
  };
}

export function verificationSummary(
  official: ScorePair,
  statistician: ScorePair,
  venue: ScorePair,
  comparison: ScoreComparison,
): string {
  const format = (pair: ScorePair) => `${pair.home}-${pair.away}`;
  const base = `Official ${format(official)} · Statistician ${format(statistician)} · Venue ${format(venue)}`;
  return comparison.allMatch ? `${base} — all match` : `${base} — MISMATCH`;
}