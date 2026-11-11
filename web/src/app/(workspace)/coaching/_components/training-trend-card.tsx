import Link from "next/link";
import { buildMetricTrend } from "@/lib/coaching/training-trend";
import type { PlanTrendArea } from "@/server/coaching/training";

// The I3 trend card: what the coach logged against the target the plan committed to.
//
// A Server Component with an inline SVG sparkline - no chart library, no client JS. Three rules it
// exists to keep:
//   1. A verdict is only shown when the metric's direction is known (see training-trend.ts); otherwise
//      the card states the target and lets the reader judge rather than colouring a number that may
//      mean the opposite.
//   2. A session with no logged metric reads "Missing data", never 0. A zero is a measurement.
//   3. The plan's review window is in GAMES and the metrics are per SESSION; both counts are shown
//      side by side so nobody mistakes one for the other.

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function Sparkline({ area }: { area: PlanTrendArea }) {
  const logged = area.points.filter((point) => point.value !== null).map((point) => ({ occurredAt: point.occurredAt, value: point.value as number, sessionId: point.sessionId }));
  const trend = buildMetricTrend({
    points: logged,
    metricKey: area.metricKey,
    target: area.targetValue,
    targetLabel: area.targetLabel,
  });
  return (
    <div className="flex items-center gap-2">
      <svg width={100} height={28} viewBox="0 0 100 28" role="img" aria-label={`${area.metricLabel} trend`} className="shrink-0">
        {trend.targetY !== null ? <line x1={0} x2={100} y1={trend.targetY} y2={trend.targetY} stroke="currentColor" strokeWidth={0.6} strokeDasharray="3 3" className="text-text-3" /> : null}
        <path d={trend.path} fill="none" stroke="currentColor" strokeWidth={1.4} className={trend.onTarget === false ? "text-warn" : "text-brand-300"} />
      </svg>
      <span className="text-xs text-text-3">
        {trend.latest !== null ? `${trend.latest}${area.unit ? ` ${area.unit}` : ""}` : "no reading"} · target {area.targetLabel}
      </span>
      {trend.onTarget === null ? (
        <span className="text-[10px] uppercase tracking-wide text-text-3">no verdict</span>
      ) : trend.onTarget ? (
        <span className="text-[10px] font-bold uppercase tracking-wide text-success">on target</span>
      ) : (
        <span className="text-[10px] font-bold uppercase tracking-wide text-warn">off target</span>
      )}
    </div>
  );
}

export function TrainingTrendCard({ areas, trainingHref }: { areas: PlanTrendArea[]; trainingHref: string }) {
  const loggedCount = (area: PlanTrendArea) => area.points.filter((point) => point.value !== null).length;
  const missingCount = (area: PlanTrendArea) => area.points.filter((point) => point.value === null).length;
  const hasSessions = areas.some((area) => area.points.length > 0);
  const window = areas[0]?.reviewWindowGames ?? 6;
  const games = areas[0]?.gamesSinceAdoption ?? 0;

  return (
    <section aria-labelledby="trend-heading" className="mt-6 rounded-lg border border-line bg-ink-800 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="trend-heading" className="text-sm font-semibold">
          Training trend
        </h2>
        <Link href={trainingHref} className="text-xs text-info underline">
          Training week
        </Link>
      </div>

      <p className="mt-1 text-xs text-text-3">
        Review window: <span className="text-text-2">{Math.min(games, window)} of {window} games</span> since adoption
        {games < window ? ` (${window - games} to go)` : " (window complete)"} · sessions assigned to this plan:{" "}
        <span className="text-text-2">{areas[0]?.points.length ?? 0}</span>
      </p>

      {!hasSessions ? (
        <p data-state="no-sessions" className="mt-2 text-sm text-text-2">
          No completed session is assigned to this plan yet. Assign it in the training week and complete it to start the
          trend.
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {areas.map((area) => (
            <li key={area.metricKey} data-metric={area.metricKey} data-missing={missingCount(area)}>
              <p className="text-xs text-text-2">
                {area.metricLabel} ·{" "}
                <span className="text-text-3">
                  {loggedCount(area)} of {area.points.length} sessions logged
                  {missingCount(area) > 0 ? ` · ${missingCount(area)} missing data` : ""}
                </span>
              </p>
              <Sparkline area={area} />
              <ol className="mt-1 space-y-0.5 text-[10px]">
                {area.points.map((point) => (
                  <li key={point.sessionId} data-session={point.sessionId} className={point.value === null ? "text-warn" : "text-text-3"}>
                    {dateFormat.format(point.occurredAt)}:{" "}
                    {point.value === null ? <span data-missing="true">Missing data</span> : `${point.value}${area.unit ? ` ${area.unit}` : ""}`}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-text-3">
        Metrics are logged per training session; the plan&apos;s own review window ({window} games) is measured on games.
      </p>
    </section>
  );
}
