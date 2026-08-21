import type { MetricDirection } from "./analytics-metrics";

// The single place directional A-vs-B comparison logic lives for every G.11 feature (Player
// Comparison, Team Comparison, Matchup Intelligence). G.9 found and fixed a real production bug
// where a "why they won" factor could point the wrong way because magnitude was compared without
// checking direction first — every new comparison in this codebase must go through here instead
// of re-deriving ">"/"<" per metric, so that class of bug can't reappear in a different file.

export type ComparisonSide = "A" | "B";
export type ComparisonResult = ComparisonSide | "EVEN" | "INSUFFICIENT_SAMPLE";

// Null means "not qualified / not available" for that side — never treated as zero.
export function compareByDirection(a: number | null, b: number | null, direction: MetricDirection): ComparisonResult {
  if (a == null || b == null) return "INSUFFICIENT_SAMPLE";
  if (a === b) return "EVEN";
  const aIsHigher = a > b;
  if (direction === "HIGHER_IS_BETTER") return aIsHigher ? "A" : "B";
  return aIsHigher ? "B" : "A";
}

// A meaningful-difference gate for Matchup Intelligence: a factor is only worth surfacing if the
// gap clears a per-metric-shape threshold, expressed as a fraction of a ceiling (same normalized-
// separation idea as why-they-won.ts, generalized so any metric can supply its own ceiling).
export function meaningfulSeparation(a: number, b: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return Math.abs(a - b) / ceiling;
}
