import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMetricTrend, trendDirection } from "./training-trend";

// The trend is a coach-facing verdict, so the tests pin the cases where a naive implementation lies:
// a metric where LOWER is better, an unknown-direction metric (no verdict at all), and a single point.

const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`);

test("a lower-is-better metric is ON target when the latest reading is below the target", () => {
  const trend = buildMetricTrend({
    points: [
      { occurredAt: at(1), value: 4.2 },
      { occurredAt: at(8), value: 3.1 },
      { occurredAt: at(15), value: 2.4 },
    ],
    metricKey: "game.tov_pg",
    target: 3,
    targetLabel: "3.0 per game",
  });
  assert.equal(trend.direction, "improving");
  assert.equal(trend.onTarget, true);
  assert.equal(trend.latest, 2.4);
  assert.equal(trend.delta, -1.8);
});

test("the same numbers on a higher-is-better metric are NOT on target", () => {
  const trend = buildMetricTrend({
    points: [
      { occurredAt: at(1), value: 4.2 },
      { occurredAt: at(15), value: 2.4 },
    ],
    metricKey: "game.ft_pct",
    target: 3,
    targetLabel: "72%",
  });
  assert.equal(trend.direction, "worsening");
  assert.equal(trend.onTarget, false);
});

test("an unknown-direction metric produces no verdict rather than a guess", () => {
  const trend = buildMetricTrend({ points: [{ occurredAt: at(1), value: 5 }], metricKey: "custom.thing", target: 3, targetLabel: "3" });
  assert.equal(trend.onTarget, null);
  assert.equal(trend.direction, "unknown");
  assert.equal(trendDirection("custom.thing"), "unknown");
});

test("no points is an empty trend, not a crash or a zero", () => {
  const trend = buildMetricTrend({ points: [], metricKey: "game.tov_pg", target: 3, targetLabel: "3.0" });
  assert.equal(trend.points.length, 0);
  assert.equal(trend.latest, null);
  assert.equal(trend.onTarget, null);
  assert.equal(trend.path, "");
  assert.equal(trend.targetY !== null, true);
});

test("a single point sits in the middle of the sparkline instead of dividing by zero", () => {
  const trend = buildMetricTrend({ points: [{ occurredAt: at(1), value: 3 }], metricKey: "game.tov_pg", target: 3, targetLabel: "3" });
  assert.match(trend.path, /^M50\.0,/);
  assert.equal(Number.isFinite(trend.targetY), true);
});

test("the sparkline stays inside its box for equal values", () => {
  const trend = buildMetricTrend({
    points: [
      { occurredAt: at(1), value: 3 },
      { occurredAt: at(2), value: 3 },
    ],
    metricKey: "game.tov_pg",
    target: 3,
    targetLabel: "3",
  });
  for (const coordinate of trend.path.matchAll(/[ML](-?\d+\.?\d*),(-?\d+\.?\d*)/g)) {
    const [, x, y] = coordinate;
    assert.ok(Number(x) >= 0 && Number(x) <= 100, `x ${x} inside 0..100`);
    assert.ok(Number(y) >= 0 && Number(y) <= 28, `y ${y} inside 0..28`);
  }
});
