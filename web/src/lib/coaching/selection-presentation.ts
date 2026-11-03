import type { SelectionCandidateResult, SelectionEvidence } from "./selection";

// Presentation helpers for the Selection Advisor (v37).
//
// WHY THIS IS SEPARATE FROM selection.ts. The advisor decides; the view explains. Everything here is display logic that must
// not change the ranking, and it is pure so the screen cannot disagree with itself about what "high fatigue" means.
//
// THE RULE THE WHOLE FILE FOLLOWS: a number is only shown when the engine actually measured it. Fouls per 36 is blank when no
// minutes were recorded, the load band says UNKNOWN rather than LOW when there is no load sample, and "why start" is built
// from the evidence the engine produced - not from a template that would read the same for every player.

export type FatigueBand = "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";

/** A load score comes from the advisor on 0..100, where 100 is freshest. Bands are on that scale, not on minutes. */
export function fatigueBand(loadScore: number | null | undefined): FatigueBand {
  if (typeof loadScore !== "number" || Number.isNaN(loadScore)) return "UNKNOWN";
  if (loadScore >= 70) return "LOW";
  if (loadScore >= 40) return "MODERATE";
  return "HIGH";
}

export function fatigueLabel(band: FatigueBand): string {
  return band === "UNKNOWN" ? "No load sample" : band.charAt(0) + band.slice(1).toLowerCase();
}

/** The fouls-per-36 evidence row, as a number, or null when the engine said it had no minutes to compute it from. */
export function foulsPer36(candidate: SelectionCandidateResult): number | null {
  const evidence = candidate.evidence.find((row) => row.metric === "Fouls per 36 minutes");
  if (!evidence || !Number.isFinite(evidence.playerValue)) return null;
  // The engine writes "not applicable - no minutes recorded" for a player with no minutes; the number would be 0 and would
  // read as "commits no fouls", which is a different and wrong statement.
  if (evidence.playerValueLabel.startsWith("not applicable")) return null;
  return evidence.playerValue;
}

export function formatFoulsPer36(candidate: SelectionCandidateResult): string {
  const value = foulsPer36(candidate);
  return value === null ? "—" : value.toFixed(1);
}

const STRONG_PERCENTILE = 55;
const WEAK_PERCENTILE = 45;

/**
 * The case FOR this player, taken from the evidence rows they rate well on. Unavailable in the engine (no samples), this
 * falls back to "no measured strengths yet" rather than inventing one.
 */
export function whyStart(candidate: SelectionCandidateResult, limit = 3): string[] {
  const strong = candidate.evidence
    .filter((row) => row.percentile >= STRONG_PERCENTILE)
    .sort((left, right) => right.percentile - left.percentile)
    .slice(0, limit)
    .map(describeEvidence);
  if (strong.length > 0) return strong;
  return candidate.hasFormSample ? [] : ["No measured sample yet in the form window"];
}

/** The case AGAINST - weak evidence rows plus the engine's own "why not him over the next man" line. */
export function whyBench(candidate: SelectionCandidateResult, limit = 3): string[] {
  const weak = candidate.evidence
    .filter((row) => row.percentile < WEAK_PERCENTILE)
    .sort((left, right) => left.percentile - right.percentile)
    .slice(0, limit)
    .map(describeEvidence);
  if (candidate.whyNot) weak.push(candidate.whyNot);
  return weak;
}

function describeEvidence(row: SelectionEvidence): string {
  const label = row.metric === "Fouls per 36 minutes" ? "Fouls" : row.metric;
  return `${label}: ${row.playerValueLabel} (${row.percentile}th pct vs ${row.baseline.label}, ${row.confidence.toLowerCase()} confidence)`;
}

/** 0..100 matchup fit as an integer percentage, or null when the engine could not rate the matchup. */
export function matchFitPercent(candidate: SelectionCandidateResult): number | null {
  return candidate.matchupScore === null ? null : Math.round(candidate.matchupScore);
}
