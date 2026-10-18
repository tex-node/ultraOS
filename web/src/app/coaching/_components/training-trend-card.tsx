import Link from "next/link";
import { buildMetricTrend } from "@/lib/coaching/training-trend";
import type { PlanTrendArea } from "@/server/coaching/training";

// The I3 trend card: what the coach logged against the target the plan committed to.
//
// A Server Component with an inline SVG sparkline - no chart library, no client JS. The verdict is
// only shown when the metric's direction is known (see training-trend.ts); otherwise the card states
// the target and lets the reader judge, rather than colouring a number that may mean the opposite.

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function Sparkline({ area }: { area: PlanTrendArea }) {
  const trend = buildMetricTrend({
    points: area.points,
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
  const logged = areas.filter((area) => area.points.length > 0);
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
      {logged.length === 0 ? (
        <p data-state="no-readings" className="mt-2 text-sm text-text-2">
          No metric logged yet. Assign this plan to a session and complete it to start the trend.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {logged.map((area) => (
            <li key={area.metricKey} data-metric={area.metricKey}>
              <p className="text-xs text-text-2">
                {area.metricLabel} · <span className="text-text-3">{area.points.length} logged session{area.points.length === 1 ? "" : "s"}</span>
              </p>
              <Sparkline area={area} />
              <p className="mt-0.5 text-[10px] text-text-3">
                {area.points.map((point) => `${dateFormat.format(point.occurredAt)}: ${point.value}`).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-text-3">
        Metrics are logged per training session; the plan&apos;s own review window ({areas[0]?.reviewWindowGames ?? 6} games) is measured on games.
      </p>
    </section>
  );
}
