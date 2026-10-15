import type { DimensionReading, Evidence, FocusArea, PlayerDevelopmentPlan, Strength } from "@/lib/coaching/player-development";
import type { DrillDefinition } from "@/lib/coaching/drills";
import { Card, ConfidenceChip, Num, SectionTitle } from "./ui";

// One player's full Development Plan (ADR-011): every Focus Area carries its Evidence behind a tap,
// the Target, the trend when known and a Drill Block; then Strengths and every reading. Readings
// below their sample gate are shown, quietly, with the sample - never turned into advice.

export function EvidenceDetails({ evidence }: { evidence: Evidence }) {
  const b = evidence.baseline;
  return (
    <details className="mt-2 text-xs text-text-2">
      <summary className="cursor-pointer select-none text-info">Evidence</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-3">Metric</dt>
        <dd>{evidence.metric}</dd>
        <dt className="text-text-3">Player</dt>
        <dd><Num>{evidence.playerValueLabel}</Num></dd>
        <dt className="text-text-3">Baseline</dt>
        <dd>{b.label} (<Num>{b.peerCount}</Num> players), median <Num>{b.medianLabel}</Num></dd>
        <dt className="text-text-3">Percentile</dt>
        <dd><Num>p{evidence.percentile}</Num></dd>
        <dt className="text-text-3">Sample</dt>
        <dd>{evidence.sample.label}</dd>
        <dt className="text-text-3">Gate cleared</dt>
        <dd>{evidence.gate}</dd>
        <dt className="text-text-3">Source</dt>
        <dd>Box score</dd>
      </dl>
    </details>
  );
}

function DrillBlock({ drills }: { drills: DrillDefinition[] }) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-text-3">Drill block</p>
      <ul className="mt-1 space-y-2">
        {drills.map((d) => (
          <li key={d.id} className="rounded-md border border-line-subtle bg-ink-700 p-2">
            <details>
              <summary className="cursor-pointer select-none text-sm text-text-1">
                {d.name} <span className="text-xs text-text-3">· {d.level.replace("_", " ").toLowerCase()} · <Num>{d.durationMinutes}</Num> min</span>
              </summary>
              <p className="mt-2 text-xs text-text-2">{d.description}</p>
              <p className="mt-1 text-xs text-text-3">Equipment: {d.equipment}</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-text-2">
                {d.coachingPoints.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </details>
            <p className="mt-1 text-xs text-brand-400">Success: {d.successMeasure}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function trendText(f: FocusArea): string | null {
  if (f.trend.direction === "UNKNOWN") return null;
  const word = f.trend.direction.toLowerCase();
  return f.trend.recentValueLabel ? `Trend: ${word} (last ${f.trend.recentGames} games: ${f.trend.recentValueLabel})` : `Trend: ${word}`;
}

function FocusAreaCard({ f }: { f: FocusArea }) {
  const trend = trendText(f);
  return (
    <Card quiet={f.evidence.confidence === "MEDIUM"} className="mb-3">
      <div data-focus={f.dimension} className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-text-1">{f.label}</h3>
        <ConfidenceChip confidence={f.evidence.confidence} />
      </div>
      <p className="mt-1 text-sm text-text-1">
        <Num>{f.evidence.playerValueLabel}</Num> <span className="text-text-3">vs {f.evidence.baseline.medianLabel} median ·</span> <Num>p{f.evidence.percentile}</Num>
      </p>
      <p className="mt-2 text-sm font-medium text-brand-400">{f.target.statement}</p>
      {trend ? <p className="mt-1 text-xs text-text-2">{trend}</p> : null}
      <p className="mt-2 text-sm text-text-2">{f.whyItMatters}</p>
      <EvidenceDetails evidence={f.evidence} />
      <DrillBlock drills={f.drills} />
    </Card>
  );
}

function StrengthRow({ s }: { s: Strength }) {
  return (
    <li className="rounded-md border border-line-subtle p-2">
      <p className="text-sm text-text-1">{s.label} <span className="text-text-3">· <Num>{s.evidence.playerValueLabel}</Num> · <Num>p{s.evidence.percentile}</Num></span></p>
      <p className="mt-1 text-xs text-text-2">{s.note}</p>
      <EvidenceDetails evidence={s.evidence} />
    </li>
  );
}

function ReadingsTable({ readings }: { readings: DimensionReading[] }) {
  return (
    <table className="w-full table-fixed text-xs">
      <thead>
        <tr className="text-left text-text-3">
          <th className="w-[34%] pb-1 font-normal">Dimension</th>
          <th className="w-[20%] pb-1 font-normal">Value</th>
          <th className="w-[12%] pb-1 font-normal">Pct</th>
          <th className="pb-1 font-normal">Sample</th>
        </tr>
      </thead>
      <tbody>
        {readings.map((r) =>
          r.status === "OK" ? (
            <tr key={r.dimension} data-reading={r.dimension} className="border-t border-line-subtle align-top">
              <td className="py-1 pr-1 text-text-1">{r.label}</td>
              <td className="py-1 pr-1 tabular-nums">{r.evidence.playerValueLabel}</td>
              <td className="py-1 pr-1 tabular-nums">p{r.evidence.percentile}</td>
              <td className="py-1 text-text-2">{r.evidence.sample.label}</td>
            </tr>
          ) : (
            <tr key={r.dimension} data-reading={r.dimension} data-insufficient="true" className="border-t border-line-subtle align-top text-text-3 opacity-70">
              <td className="py-1 pr-1">{r.label}</td>
              <td className="py-1 pr-1" colSpan={3}>Not enough data: {r.sampleLabel} (needs {r.gate})</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

export function PlayerPlanView({ plan }: { plan: PlayerDevelopmentPlan }) {
  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold text-text-1">
          {plan.jerseyNumber != null ? <span className="mr-2 tabular-nums text-text-3">#{plan.jerseyNumber}</span> : null}
          {plan.name}
        </h1>
        <p className="mt-1 text-sm text-text-2">
          {plan.position && plan.positionGroup !== "UNKNOWN" ? `${plan.position} · ` : "Position not set · "}
          <Num>{plan.gamesPlayed}</Num> games played
        </p>
      </header>

      {plan.status === "INSUFFICIENT_DATA" ? (
        <Card quiet className="mt-4">
          <p data-state="insufficient" className="text-sm text-text-2">
            Not enough games yet to say anything reliable about {plan.name}. Plans appear once a player has enough games and attempts; the readings below show what is still missing.
          </p>
        </Card>
      ) : null}

      <SectionTitle>Focus areas</SectionTitle>
      {plan.focusAreas.length > 0 ? (
        plan.focusAreas.map((f) => <FocusAreaCard key={f.dimension} f={f} />)
      ) : (
        <p className="text-sm text-text-3">{plan.status === "OK" ? "Nothing falls below the focus bar this season." : "No focus areas yet."}</p>
      )}

      <SectionTitle>Strengths</SectionTitle>
      {plan.strengths.length > 0 ? (
        <ul className="space-y-2">{plan.strengths.map((s) => <StrengthRow key={s.dimension} s={s} />)}</ul>
      ) : (
        <p className="text-sm text-text-3">No standout strengths yet.</p>
      )}

      <SectionTitle>All readings</SectionTitle>
      <Card>
        <ReadingsTable readings={plan.readings} />
      </Card>
    </div>
  );
}
