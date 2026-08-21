import { isPlayerMetricQualified, PLAYER_METRICS, type PlayerMetricId } from "./analytics-metrics";
import { compareByDirection, type ComparisonResult } from "./directional-comparison";
import type { SeasonPlayerTotals } from "./league-analytics";
import { PLAYER_DNA_DIMENSION_LABEL, type PlayerDna, type PlayerDnaDimensionKey } from "./player-dna";

export type PlayerIdentity = {
  playerId: string;
  name: string;
  ultraAthleteId: string | null;
  clubShortName: string;
  clubName: string;
};

export type PlayerMetricComparisonRow = {
  metricId: PlayerMetricId;
  label: string;
  aValue: string;
  bValue: string;
  result: ComparisonResult;
};

export type PlayerHeadToHeadEdge = { dimension: PlayerDnaDimensionKey; label: string; result: ComparisonResult };

export type PlayerComparisonResult = {
  a: PlayerIdentity;
  b: PlayerIdentity;
  gamesA: number;
  gamesB: number;
  metrics: PlayerMetricComparisonRow[];
  dnaA: PlayerDna | null;
  dnaB: PlayerDna | null;
  edges: PlayerHeadToHeadEdge[];
  summary: string[];
};

const DNA_PHRASE: Record<PlayerDnaDimensionKey, { forA: string; noun: string }> = {
  SCORING: { forA: "carried the larger scoring load", noun: "scoring" },
  SHOOTING: { forA: "shot the ball more efficiently", noun: "shooting efficiency" },
  PLAYMAKING: { forA: "contributed more strongly as a playmaker", noun: "playmaking" },
  REBOUNDING: { forA: "contributed more strongly on the glass", noun: "rebounding" },
  DEFENSIVE_ACTIVITY: { forA: "was more active defensively", noun: "defensive activity" },
  BALL_SECURITY: { forA: "took better care of the ball", noun: "ball security" },
};

export function comparePlayers(
  identityA: PlayerIdentity,
  identityB: PlayerIdentity,
  totalsA: SeasonPlayerTotals,
  totalsB: SeasonPlayerTotals,
  dnaA: PlayerDna | null,
  dnaB: PlayerDna | null,
): PlayerComparisonResult {
  const metrics: PlayerMetricComparisonRow[] = PLAYER_METRICS
    .filter((m) => m.sourceRequirement === "BOX_SCORE_ONLY")
    .map((m) => {
      const aQualified = isPlayerMetricQualified(m, totalsA);
      const bQualified = isPlayerMetricQualified(m, totalsB);
      const aValue = aQualified ? m.getValue(totalsA) : null;
      const bValue = bQualified ? m.getValue(totalsB) : null;
      return {
        metricId: m.id,
        label: m.label,
        aValue: aValue != null ? m.formatter(aValue) : "—",
        bValue: bValue != null ? m.formatter(bValue) : "—",
        result: compareByDirection(aValue, bValue, m.direction),
      };
    });

  const edges: PlayerHeadToHeadEdge[] = [];
  const summary: string[] = [];
  if (dnaA && dnaB) {
    for (const dimA of dnaA.dimensions) {
      const dimB = dnaB.dimensions.find((d) => d.key === dimA.key);
      // DNA indices are already direction-normalized (a higher index is always better, even for
      // inverted stats like Ball Security), so every dimension compares as HIGHER_IS_BETTER here.
      edges.push({ dimension: dimA.key, label: PLAYER_DNA_DIMENSION_LABEL[dimA.key], result: compareByDirection(dimA.index, dimB?.index ?? null, "HIGHER_IS_BETTER") });
    }

    const advantageA = topAdvantage(dnaA, dnaB);
    const advantageB = topAdvantage(dnaB, dnaA);
    if (advantageA && advantageB && advantageA !== advantageB) {
      summary.push(
        `${identityA.name} ${DNA_PHRASE[advantageA].forA}, while ${identityB.name} ${DNA_PHRASE[advantageB].forA.replace("carried the larger", "carried a larger")}.`,
      );
    } else if (advantageA) {
      summary.push(`${identityA.name} ${DNA_PHRASE[advantageA].forA} relative to ${identityB.name} this season.`);
    } else if (advantageB) {
      summary.push(`${identityB.name} ${DNA_PHRASE[advantageB].forA} relative to ${identityA.name} this season.`);
    } else {
      summary.push(`${identityA.name} and ${identityB.name} produced a closely matched statistical profile this season.`);
    }

    // A second, concrete supporting sentence naming an actual per-game statline, so the summary
    // isn't only an abstract index comparison — pick the metric with the clearest real gap.
    const supporting = pickSupportingMetric(metrics);
    if (supporting) {
      summary.push(`${supporting.result === "A" ? identityA.name : identityB.name} led in ${supporting.label.toLowerCase()}, ${supporting.aValue} to ${supporting.bValue}.`);
    }
    summary.push("This reflects each player's Season Zero statistical record, not a prediction of future performance.");
  } else {
    summary.push("One or both players don't yet have enough games for a Player DNA profile — comparison limited to raw per-game totals.");
  }

  return { a: identityA, b: identityB, gamesA: totalsA.gamesPlayed, gamesB: totalsB.gamesPlayed, metrics, dnaA, dnaB, edges, summary };
}

// The metric with the single largest real gap (by raw magnitude of the formatted numeric
// value), among metrics where one side actually won — used only to pick a concrete, real
// number for the second summary sentence, never to declare a winner on its own.
function pickSupportingMetric(metrics: PlayerMetricComparisonRow[]): (PlayerMetricComparisonRow & { result: "A" | "B" }) | null {
  const decisive = metrics.filter((m): m is PlayerMetricComparisonRow & { result: "A" | "B" } => m.result === "A" || m.result === "B");
  if (decisive.length === 0) return null;
  return decisive.find((m) => m.metricId === "PPG") ?? decisive[0];
}

// The single dimension where `primary` holds the largest index advantage over `other`, among
// dimensions both players have a real (non-null) index for. Returns null if primary has no
// advantage in any shared dimension.
function topAdvantage(primary: PlayerDna, other: PlayerDna): PlayerDnaDimensionKey | null {
  let best: { key: PlayerDnaDimensionKey; gap: number } | null = null;
  for (const dim of primary.dimensions) {
    const otherDim = other.dimensions.find((d) => d.key === dim.key);
    if (dim.index == null || otherDim?.index == null) continue;
    const gap = dim.index - otherDim.index;
    if (gap > 0 && (best == null || gap > best.gap)) best = { key: dim.key, gap };
  }
  return best?.key ?? null;
}
