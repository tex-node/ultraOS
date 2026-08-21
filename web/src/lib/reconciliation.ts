// Score reconciliation between the two independently-operated live consoles: the scorer
// console (official game score authority — Fixture.homeScore/awayScore) and the statistician
// console (statistical attribution authority — its own ledger of made/missed shot events,
// tagged StatDataSource.ULTRA_NATIVE_LIVE_STATISTICIAN). Pure functions only, no Prisma.
//
// Deliberately does not auto-resolve a mismatch in either direction (see games/stats-actions.ts
// for the audited verify/override workflow) — this module only classifies, never mutates.
export type ReconciliationStatus = "MATCHED" | "MISMATCH" | "UNAVAILABLE";

export type TeamReconciliation = {
  officialScore: number;
  statisticalScore: number;
  difference: number;
  status: ReconciliationStatus;
};

export type GameReconciliation = {
  home: TeamReconciliation;
  away: TeamReconciliation;
  overallStatus: ReconciliationStatus;
};

function reconcileTeamScore(officialScore: number, statisticalScore: number, hasStatisticianEvents: boolean): TeamReconciliation {
  if (!hasStatisticianEvents) {
    return { officialScore, statisticalScore: 0, difference: 0, status: "UNAVAILABLE" };
  }
  const difference = officialScore - statisticalScore;
  return { officialScore, statisticalScore, difference, status: difference === 0 ? "MATCHED" : "MISMATCH" };
}

// hasStatisticianEvents distinguishes "the statistician hasn't started recording yet" (both
// teams UNAVAILABLE) from "the statistician has recorded events and this team's derived total
// is legitimately 0" (e.g. before either team has scored) - those are not the same state and
// must not both render as a silent, unremarkable 0-0.
export function reconcileGameScore(
  officialHomeScore: number,
  officialAwayScore: number,
  statisticalHomeScore: number,
  statisticalAwayScore: number,
  hasStatisticianEvents: boolean,
): GameReconciliation {
  const home = reconcileTeamScore(officialHomeScore, statisticalHomeScore, hasStatisticianEvents);
  const away = reconcileTeamScore(officialAwayScore, statisticalAwayScore, hasStatisticianEvents);
  const overallStatus: ReconciliationStatus =
    home.status === "UNAVAILABLE" || away.status === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : home.status === "MISMATCH" || away.status === "MISMATCH"
        ? "MISMATCH"
        : "MATCHED";
  return { home, away, overallStatus };
}
