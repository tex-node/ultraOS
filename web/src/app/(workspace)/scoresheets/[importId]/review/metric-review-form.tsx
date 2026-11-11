"use client";

import { useActionState, useMemo, useState } from "react";
import type { MetricChecksumReport, MetricColumn, MetricScoresheet } from "@/lib/scoresheet/metric-scoresheet";
import { reviewMetricScoresheet, type MetricReviewState } from "../../actions";

// The review queue's multi-sport editor (streak v7, Prompt 2).
//
// The basketball form hardcodes eighteen columns (PTS, FGM, REB…). This one renders whatever the sport's
// definition declares, so volleyball shows Kills/Aces/Blocks/Digs and nothing tries to find "rebounds".
//
// Same two honesty rules as the basketball form:
//   - the checksum panel is not advisory: Approve refuses while a check fails, and the action re-runs the
//     same rules server-side, so a client that skips the panel gains nothing;
//   - totals are shown per column as they are computed here, and the sheet-specific check (volleyball's
//     points = kills + aces + blocks) is displayed with both numbers, so a reviewer sees WHY it failed.

export type MetricReviewInitial = {
  importId: string;
  status: string;
  sourceLabel: string;
  sportName: string;
  columns: MetricColumn[];
  sheet: MetricScoresheet;
  report?: MetricChecksumReport;
  derivation: string | null;
  fixtures: { id: string; label: string }[];
};

const cellInput = "w-14 rounded border border-line bg-ink-700 px-1 py-1 text-center text-xs tabular-nums";

export function MetricReviewForm({ initial }: { initial: MetricReviewInitial }) {
  const bound = useMemo(() => reviewMetricScoresheet.bind(null, initial.importId), [initial.importId]);
  const [state, formAction, pending] = useActionState(bound, {} as MetricReviewState);
  const [sheet, setSheet] = useState<MetricScoresheet>(initial.sheet);
  const [fixtureId, setFixtureId] = useState(initial.fixtures[0]?.id ?? "");
  const [rejectReason, setRejectReason] = useState("");

  const report = state.report ?? initial.report;
  const approved = state.approved === true;

  const setMetric = (teamIndex: number, playerIndex: number, key: string, value: number) => {
    setSheet((current) => ({
      ...current,
      teams: current.teams.map((team, index) =>
        index === teamIndex
          ? { ...team, players: team.players.map((player, playerIdx) => (playerIdx === playerIndex ? { ...player, metrics: { ...player.metrics, [key]: value } } : player)) }
          : team,
      ),
    }));
  };

  const totals = sheet.teams.map((team) => ({
    clubName: team.clubName,
    columns: Object.fromEntries(initial.columns.map((column) => [column.key, team.players.reduce((sum, player) => sum + (player.metrics[column.key] ?? 0), 0)])),
  }));

  return (
    <div className="mt-6 space-y-6">
      <input type="hidden" name="payload" value={JSON.stringify(sheet)} form={`metric-review-${initial.importId}`} />

      {state.error ? (
        <p role="alert" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {approved ? (
        <p role="status" className="rounded-md bg-brand-400/10 p-3 text-sm text-brand-300">
          Approved{state.ingested ? ` — ${state.ingested.written} metric row(s) written${state.ingested.skipped > 0 ? `, ${state.ingested.skipped} skipped` : ""}.` : ". Choose the fixture and ingest to write the rows."}
        </p>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {initial.sportName} sheet <span className="text-sm font-normal text-text-3">· {sheet.teams.map((team) => team.clubName).join(" v ")}</span>
        </h2>
        <p className="text-xs text-text-3">
          Columns come from the sport definition: {initial.columns.map((column) => column.label).join(", ")}
        </p>
      </div>

      {sheet.warnings.length > 0 ? (
        <ul className="rounded-md bg-warn/10 p-3 text-xs text-warn">
          {sheet.warnings.map((warning) => (
            <li key={warning}>· {warning}</li>
          ))}
        </ul>
      ) : null}

      <form id={`metric-review-${initial.importId}`} action={formAction}>
        <input type="hidden" name="fixtureId" value={fixtureId} />
        <div className="space-y-6">
          {sheet.teams.map((team, teamIndex) => (
            <section key={team.clubName} className="overflow-x-auto rounded-lg border border-line bg-ink-800 p-3">
              <h3 className="text-sm font-semibold">{team.clubName}</h3>
              <table className="mt-2 min-w-full text-xs">
                <thead>
                  <tr className="text-left text-text-3">
                    <th className="p-1">#</th>
                    <th className="p-1">Player</th>
                    {initial.columns.map((column) => (
                      <th key={column.key} className="p-1 text-center">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.players.map((player, playerIndex) => (
                    <tr key={`${player.name}-${playerIndex}`} className="border-t border-line-subtle">
                      <td className="p-1 text-text-3">{player.jersey ?? "–"}</td>
                      <td className="p-1 font-semibold text-text-1">{player.name}</td>
                      {initial.columns.map((column) => (
                        <td key={column.key} className="p-1 text-center">
                          <input
                            type="number"
                            min={0}
                            max={500}
                            value={player.metrics[column.key] ?? 0}
                            onChange={(event) => setMetric(teamIndex, playerIndex, column.key, Number(event.target.value) || 0)}
                            className={cellInput}
                            aria-label={`${player.name} ${column.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-semibold">
                    <td className="p-1" />
                    <td className="p-1">Team total</td>
                    {initial.columns.map((column) => (
                      <td key={column.key} className="p-1 text-center tabular-nums">
                        {totals[teamIndex].columns[column.key] ?? 0}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </section>
          ))}
        </div>
      </form>

      <section className="rounded-lg border border-line bg-ink-800 p-4">
        <h3 className="text-sm font-semibold">Checks</h3>
        {initial.derivation ? <p className="mt-0.5 text-xs text-text-3">{initial.derivation}</p> : null}
        {report ? (
          <>
            <p className={`mt-2 text-sm font-semibold ${report.ok ? "text-brand-300" : "text-danger"}`}>
              {report.ok ? "All checks pass" : `${report.checks.filter((check) => !check.ok).length} check(s) failing`}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {report.checks.map((check) => (
                <li key={check.id} className={check.ok ? "text-text-2" : "text-danger"}>
                  {check.ok ? "✓" : "✗"} {check.label} <span className="text-text-3">— {check.detail}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-text-3">Run a check to see the report.</p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <button type="submit" form={`metric-review-${initial.importId}`} name="intent" value="check" disabled={pending} className="rounded-md border border-line px-3 py-2 text-sm">
            Re-run checks
          </button>
          <button type="submit" form={`metric-review-${initial.importId}`} name="intent" value="approve" disabled={pending || report?.ok === false} className="rounded-md bg-brand-400 px-3 py-2 text-sm font-semibold text-ink-900 disabled:opacity-40">
            Approve
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-ink-800 p-4">
        <h3 className="text-sm font-semibold">Ingest into a fixture</h3>
        <p className="mt-0.5 text-xs text-text-3">
          Rows are written per player per metric. A name that does not match a player on that side&apos;s roster is skipped and
          reported — the ingest never creates an athlete from a scoresheet.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-text-3">
            Fixture
            <select value={fixtureId} onChange={(event) => setFixtureId(event.target.value)} className="mt-1 block min-h-[40px] rounded-lg bg-white/[.05] px-3 py-2 text-sm">
              {initial.fixtures.length === 0 ? <option value="">No fixtures with a game for this sport</option> : null}
              {initial.fixtures.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            form={`metric-review-${initial.importId}`}
            name="intent"
            value="ingest"
            disabled={pending || !approved || !fixtureId}
            className="rounded-md bg-brand-400 px-3 py-2 text-sm font-semibold text-ink-900 disabled:opacity-40"
          >
            Ingest metric rows
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-danger/20 bg-ink-800 p-4">
        <h3 className="text-sm font-semibold">Reject</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-text-3">
            Reason (traceable)
            <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} className="mt-1 block min-h-[40px] w-72 rounded-lg bg-white/[.05] px-3 py-2 text-sm" />
          </label>
          <button type="submit" form={`metric-review-${initial.importId}`} name="intent" value="reject" disabled={pending} className="rounded-md border border-danger/40 px-3 py-2 text-sm text-danger">
            Reject
          </button>
        </div>
        <input type="hidden" name="rejectReason" value={rejectReason} form={`metric-review-${initial.importId}`} />
      </section>
    </div>
  );
}
