// Deterministic live milestones (G.18, Part XVII). Pure, threshold-based, derived only from the
// live box score already computed by event-derived-stats.ts - every milestone is directly
// traceable to a specific captured statistic, never an "exaggerated" label. Season-wide firsts
// (e.g. "first Ultra Basketball 4PT make ever") are out of scope for this pass - they'd require
// cross-referencing every prior game's ledger, and with only one native game in production (zero
// player attribution) there is nothing real to validate that against yet. In-game thresholds are
// what's built here; provisional season-high comparisons live in provisional-records.ts.
import type { DerivedPlayerStats } from "./event-derived-stats";

export type LiveMilestoneKey = "DOUBLE_DIGIT_POINTS" | "DOUBLE_DIGIT_REBOUNDS" | "FOUR_POINT_MAKE";

export type LiveMilestone = { playerId: string; key: LiveMilestoneKey; label: string; statValue: number };

export function detectLiveMilestones(players: DerivedPlayerStats[]): LiveMilestone[] {
  const milestones: LiveMilestone[] = [];
  for (const p of players) {
    if (p.points >= 10) milestones.push({ playerId: p.playerId, key: "DOUBLE_DIGIT_POINTS", label: `${p.points} points`, statValue: p.points });
    if (p.rebounds >= 10) milestones.push({ playerId: p.playerId, key: "DOUBLE_DIGIT_REBOUNDS", label: `${p.rebounds} rebounds`, statValue: p.rebounds });
    if (p.fourPointsMade >= 1) milestones.push({ playerId: p.playerId, key: "FOUR_POINT_MAKE", label: `${p.fourPointsMade} four-point make${p.fourPointsMade > 1 ? "s" : ""}`, statValue: p.fourPointsMade });
  }
  return milestones;
}
