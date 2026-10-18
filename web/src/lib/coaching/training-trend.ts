// P15 I3: the training trend. Pure geometry so it can be unit tested without a database or React.
//
// The plan committed to a target ("3.0 turnovers per game or fewer"). The coach logs the metric after
// each session. This turns those logged points into the two things the Coach Hub needs: a verdict
// (is the latest reading on the right side of the target?) and a sparkline path. The verdict is
// deliberately withheld when we do not know which direction is good for the metric - claiming "on
// target" for a metric where lower is better would invert the meaning.

export type TrendPoint = { occurredAt: Date; value: number };

export type MetricTrend = {
  points: TrendPoint[];
  target: number | null;
  targetLabel: string;
  targetY: number | null;
  path: string;
  direction: "improving" | "worsening" | "flat" | "unknown";
  onTarget: boolean | null;
  latest: number | null;
  first: number | null;
  delta: number | null;
};

// Metrics whose increase is good for the athlete. Anything not listed is treated as "unknown
// direction" rather than guessed - the verdict is then omitted instead of being wrong.
const HIGHER_IS_BETTER = new Set([
  "game.ft_pct",
  "game.ts_pct",
  "game.efg_pct",
  "game.pts_pg",
  "game.reb_pg",
  "game.ast_pg",
  "game.stl_pg",
  "game.blk_pg",
  "game.min_pg",
]);
const LOWER_IS_BETTER = new Set(["game.tov_pg", "game.pf_pg"]);

export function trendDirection(metricKey: string): "higher" | "lower" | "unknown" {
  if (HIGHER_IS_BETTER.has(metricKey)) return "higher";
  if (LOWER_IS_BETTER.has(metricKey)) return "lower";
  return "unknown";
}

const WIDTH = 100;
const HEIGHT = 28;
const PAD = 2;

export function buildMetricTrend(input: { points: TrendPoint[]; metricKey: string; target: number | null; targetLabel: string; width?: number; height?: number }): MetricTrend {
  const points = [...input.points].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const first = points.length > 0 ? points[0].value : null;
  const latest = points.length > 0 ? points[points.length - 1].value : null;
  const delta = first !== null && latest !== null ? Math.round((latest - first) * 10) / 10 : null;
  const direction = trendDirection(input.metricKey);

  const target = input.target;
  const values = [...points.map((point) => point.value), ...(target !== null ? [target] : [])];
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const span = max - min || 1;

  const width = input.width ?? WIDTH;
  const height = input.height ?? HEIGHT;
  const usableWidth = width - PAD * 2;
  const usableHeight = height - PAD * 2;
  const xFor = (index: number) => (points.length <= 1 ? PAD + usableWidth / 2 : PAD + (usableWidth * index) / (points.length - 1));
  const yFor = (value: number) => PAD + usableHeight - ((value - min) / span) * usableHeight;

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)},${yFor(point.value).toFixed(1)}`).join(" ");
  const targetY = target !== null ? Math.round(yFor(target) * 10) / 10 : null;

  let verdict: boolean | null = null;
  if (latest !== null && target !== null && direction !== "unknown") {
    verdict = direction === "higher" ? latest >= target : latest <= target;
  }

  let movement: MetricTrend["direction"] = "unknown";
  if (delta !== null && direction !== "unknown") {
    if (Math.abs(delta) < 0.05) movement = "flat";
    else if (direction === "higher") movement = delta > 0 ? "improving" : "worsening";
    else movement = delta < 0 ? "improving" : "worsening";
  }

  return { points, target, targetLabel: input.targetLabel, targetY, path, direction: movement, onTarget: verdict, latest, first, delta };
}
