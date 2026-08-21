import { TEAM_METRICS, type TeamMetricId } from "./analytics-metrics";
import { compareByDirection, type ComparisonResult } from "./directional-comparison";
import type { SeasonTeamTotals } from "./season-team-totals";
import { TEAM_DNA_DIMENSION_LABEL, type TeamDna, type TeamDnaDimensionKey } from "./team-dna";

export type TeamMetricComparisonRow = {
  metricId: TeamMetricId;
  label: string;
  aValue: string;
  bValue: string;
  result: ComparisonResult;
};

export type TeamHeadToHeadEdge = { dimension: TeamDnaDimensionKey; label: string; result: ComparisonResult };

export type TeamComparisonResult = {
  a: SeasonTeamTotals;
  b: SeasonTeamTotals;
  metrics: TeamMetricComparisonRow[];
  dnaA: TeamDna | null;
  dnaB: TeamDna | null;
  edges: TeamHeadToHeadEdge[];
  summary: string[];
};

const DNA_PHRASE: Record<TeamDnaDimensionKey, string> = {
  SCORING: "holds the stronger scoring profile",
  SHOOTING: "shot the ball more efficiently",
  PLAYMAKING: "generated more assists per game",
  REBOUNDING: "holds the rebounding edge",
  DEFENSE: "held opponents to fewer points",
  TRANSITION: "produced more in transition",
  PAINT_ATTACK: "attacked the paint more",
  BENCH_PRODUCTION: "got more from the bench",
  BALL_SECURITY: "took better care of the ball",
};

export function compareTeams(totalsA: SeasonTeamTotals, totalsB: SeasonTeamTotals, dnaA: TeamDna | null, dnaB: TeamDna | null): TeamComparisonResult {
  const metrics: TeamMetricComparisonRow[] = TEAM_METRICS
    .filter((m) => m.sourceRequirement === "BOX_SCORE_ONLY")
    .map((m) => {
      const aValue = m.getValue(totalsA);
      const bValue = m.getValue(totalsB);
      return {
        metricId: m.id,
        label: m.label,
        aValue: aValue != null ? m.formatter(aValue) : "—",
        bValue: bValue != null ? m.formatter(bValue) : "—",
        result: compareByDirection(aValue, bValue, m.direction),
      };
    });

  const edges: TeamHeadToHeadEdge[] = [];
  const summary: string[] = [];
  if (dnaA && dnaB) {
    for (const dimA of dnaA.dimensions) {
      const dimB = dnaB.dimensions.find((d) => d.key === dimA.key);
      // Team DNA indices are already direction-normalized the same way Player DNA's are.
      edges.push({ dimension: dimA.key, label: TEAM_DNA_DIMENSION_LABEL[dimA.key], result: compareByDirection(dimA.index, dimB?.index ?? null, "HIGHER_IS_BETTER") });
    }

    const advantageA = topAdvantage(dnaA, dnaB);
    const advantageB = topAdvantage(dnaB, dnaA);
    if (advantageA && advantageB && advantageA !== advantageB) {
      summary.push(`${totalsA.shortName} ${DNA_PHRASE[advantageA]}, while ${totalsB.shortName} ${DNA_PHRASE[advantageB]}.`);
    } else if (advantageA) {
      summary.push(`${totalsA.shortName} ${DNA_PHRASE[advantageA]} relative to ${totalsB.shortName} this season.`);
    } else if (advantageB) {
      summary.push(`${totalsB.shortName} ${DNA_PHRASE[advantageB]} relative to ${totalsA.shortName} this season.`);
    } else {
      summary.push(`${totalsA.shortName} and ${totalsB.shortName} produced a closely matched statistical profile this season.`);
    }

    const supporting = pickSupportingMetric(metrics);
    if (supporting) {
      const winnerName = supporting.result === "A" ? totalsA.shortName : totalsB.shortName;
      summary.push(`${winnerName} also led in ${supporting.label.toLowerCase()}, ${supporting.aValue} to ${supporting.bValue}.`);
    }
    summary.push("The statistical contrast reflects two different Season Zero team identities, not a prediction of a future result.");
  } else {
    summary.push("One or both clubs don't yet have enough games for a Team DNA profile — comparison limited to season totals.");
  }

  return { a: totalsA, b: totalsB, metrics, dnaA, dnaB, edges, summary };
}

function pickSupportingMetric(metrics: TeamMetricComparisonRow[]): (TeamMetricComparisonRow & { result: "A" | "B" }) | null {
  const decisive = metrics.filter((m): m is TeamMetricComparisonRow & { result: "A" | "B" } => m.result === "A" || m.result === "B");
  if (decisive.length === 0) return null;
  return decisive.find((m) => m.metricId === "PPG") ?? decisive[0];
}

function topAdvantage(primary: TeamDna, other: TeamDna): TeamDnaDimensionKey | null {
  let best: { key: TeamDnaDimensionKey; gap: number } | null = null;
  for (const dim of primary.dimensions) {
    const otherDim = other.dimensions.find((d) => d.key === dim.key);
    if (dim.index == null || otherDim?.index == null) continue;
    const gap = dim.index - otherDim.index;
    if (gap > 0 && (best == null || gap > best.gap)) best = { key: dim.key, gap };
  }
  return best?.key ?? null;
}
