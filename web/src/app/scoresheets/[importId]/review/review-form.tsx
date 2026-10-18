"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { ChecksumReport } from "@/lib/scoresheet/checksums";
import type { CorrectedPlayer, CorrectedTeam } from "@/server/scoresheet/imports";
import { reviewScoresheet, type ReviewState } from "../../actions";

// The review queue's editor (P15 I1). Left: the sheet image, zoomable in a new tab. Right: the
// extracted values as real inputs, the checksum panel, and the approve/reject decisions.
//
// Two design rules, both from the roadmap's honesty requirement:
//   - The checksum panel is not advisory. "Approve" refuses to save while any check fails, and the
//     action re-runs the same rules server-side, so a client that skips the panel gains nothing.
//   - The Totals cells are INPUTS pre-filled from the sheet's printed totals row, not sums computed
//     from the player rows. Auto-summing would make TEAM_SUM checks tautological - the printed total
//     is exactly what the reviewer is checking the cells against.

export type ReviewInitial = {
  importId: string;
  status: string;
  sourceLabel: string;
  imageUrl: string;
  imageName: string | null;
  warnings: string[];
  scheduledAt: string;
  homeScore: number;
  awayScore: number;
  periods: { label: string; homeScore: number; awayScore: number }[];
  home: CorrectedTeam;
  away: CorrectedTeam;
  report?: ChecksumReport;
};

const NUM_COLUMNS: { key: keyof CorrectedPlayer; label: string }[] = [
  { key: "minutesPlayed", label: "MIN" },
  { key: "points", label: "PTS" },
  { key: "fgm", label: "FGM" },
  { key: "fga", label: "FGA" },
  { key: "fg2m", label: "2PM" },
  { key: "fg2a", label: "2PA" },
  { key: "fg3m", label: "3PM" },
  { key: "fg3a", label: "3PA" },
  { key: "ftm", label: "FTM" },
  { key: "fta", label: "FTA" },
  { key: "oreb", label: "OR" },
  { key: "dreb", label: "DR" },
  { key: "reb", label: "REB" },
  { key: "assists", label: "AST" },
  { key: "turnovers", label: "TO" },
  { key: "steals", label: "STL" },
  { key: "blocks", label: "BLK" },
  { key: "fouls", label: "PF" },
];

const emptyPlayer = (): CorrectedPlayer => ({
  name: "", jerseyNumber: null, didNotPlay: false, minutesPlayed: 0, points: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  oreb: 0, dreb: 0, reb: 0, assists: 0, turnovers: 0, steals: 0, blocks: 0, fouls: 0,
});

const cellInput = "w-14 rounded border border-line bg-ink-700 px-1 py-1 text-center text-xs tabular-nums";

export function ReviewForm({ initial }: { initial: ReviewInitial }) {
  const bound = useMemo(() => reviewScoresheet.bind(null, initial.importId), [initial.importId]);
  const [state, formAction, pending] = useActionState(bound, {} as ReviewState);
  const [home, setHome] = useState<CorrectedTeam>(initial.home);
  const [away, setAway] = useState<CorrectedTeam>(initial.away);
  const [scheduledAt, setScheduledAt] = useState(initial.scheduledAt);
  const [homeScore, setHomeScore] = useState(initial.homeScore);
  const [awayScore, setAwayScore] = useState(initial.awayScore);
  const [periods, setPeriods] = useState(initial.periods);
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const payload = JSON.stringify({ scheduledAt, homeScore, awayScore, periods, home, away, note });

  function updateTeam(side: "home" | "away", updater: (team: CorrectedTeam) => CorrectedTeam) {
    if (side === "home") setHome((team) => updater(team));
    else setAway((team) => updater(team));
  }

  const renderTeam = (side: "home" | "away", team: CorrectedTeam) => (
    <section className="rounded-lg border border-line bg-ink-800 p-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-3" htmlFor={`${side}-club`}>
            Club
          </label>
          <input
            id={`${side}-club`}
            value={team.clubName}
            onChange={(event) => updateTeam(side, (current) => ({ ...current, clubName: event.target.value }))}
            className="min-h-[36px] flex-1 rounded border border-line bg-ink-700 px-2 text-sm"
          />
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-text-3">
                <th className="p-1 text-left">#</th>
                <th className="p-1 text-left">Player</th>
                {NUM_COLUMNS.map((column) => (
                  <th key={column.key} className="p-1 text-center">
                    {column.label}
                  </th>
                ))}
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {team.players.map((player, index) => (
                <tr key={`${side}-${index}`} className="border-t border-line-subtle">
                  <td className="p-1">
                    <input
                      value={player.jerseyNumber ?? ""}
                      onChange={(event) => {
                        const value = event.target.value === "" ? null : Number(event.target.value);
                        updateTeam(side, (current) => ({ ...current, players: current.players.map((p, i) => (i === index ? { ...p, jerseyNumber: Number.isFinite(value as number) ? value : null } : p)) }));
                      }}
                      className="w-12 rounded border border-line bg-ink-700 px-1 py-1 text-center text-xs"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      value={player.name}
                      onChange={(event) => updateTeam(side, (current) => ({ ...current, players: current.players.map((p, i) => (i === index ? { ...p, name: event.target.value } : p)) }))}
                      className="min-w-[10rem] rounded border border-line bg-ink-700 px-2 py-1 text-xs"
                    />
                  </td>
                  {NUM_COLUMNS.map((column) => (
                    <td key={column.key} className="p-1">
                      <input
                        type="number"
                        min={0}
                        value={player[column.key] as number}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          updateTeam(side, (current) => ({
                            ...current,
                            players: current.players.map((p, i) => (i === index ? { ...p, [column.key]: Number.isFinite(value) ? value : 0 } : p)),
                          }));
                        }}
                        className={cellInput}
                      />
                    </td>
                  ))}
                  <td className="p-1">
                    <button
                      type="button"
                      onClick={() => updateTeam(side, (current) => ({ ...current, players: current.players.filter((_, i) => i !== index) }))}
                      className="text-xs text-danger"
                      aria-label={`Remove ${player.name || "row"}`}
                    >
                      remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" onClick={() => updateTeam(side, (current) => ({ ...current, players: [...current.players, emptyPlayer()] }))} className="text-xs text-info underline">
            Add player row
          </button>
          <div className="flex items-center gap-2 text-xs text-text-3">
            <span>Printed totals:</span>
            {(["points", "rebounds", "assists", "turnovers", "fouls"] as const).map((key) => (
              <label key={key} className="flex items-center gap-1">
                <span className="uppercase">{key.slice(0, 3)}</span>
                <input
                  type="number"
                  min={0}
                  value={team.totals[key]}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    updateTeam(side, (current) => ({ ...current, totals: { ...current.totals, [key]: Number.isFinite(value) ? value : 0 } }));
                  }}
                  className="w-14 rounded border border-line bg-ink-700 px-1 py-1 text-center tabular-nums"
                />
              </label>
            ))}
          </div>
        </div>
      </section>
  );

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <a href={initial.imageUrl} target="_blank" rel="noreferrer" className="block rounded-lg border border-line bg-ink-800 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={initial.imageUrl} alt={`Scoresheet ${initial.sourceLabel}`} className="max-h-[70vh] w-full object-contain" />
        </a>
        <p className="mt-1 text-xs text-text-3">
          {initial.imageName ?? "sheet image"} - open in a new tab to zoom.
        </p>
        {initial.warnings.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 rounded-md bg-warn/10 p-3 pl-6 text-xs text-warn">
            {initial.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </aside>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="payload" value={payload} />

        {state.error ? (
          <p role="alert" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        {state.approved ? (
          <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">
            Approved. This sheet is ready for <code>external-stats-ingest.ts --scoresheetImportId</code>.{" "}
            <Link href="/scoresheets" className="underline">
              Back to scoresheets
            </Link>
          </p>
        ) : null}
        {state.rejected ? (
          <p role="status" className="rounded-md bg-warn/10 p-3 text-sm text-warn">
            Rejected and recorded.{" "}
            <Link href="/scoresheets" className="underline">
              Back to scoresheets
            </Link>
          </p>
        ) : null}

        <div className="grid gap-3 rounded-lg border border-line bg-ink-800 p-3 sm:grid-cols-3">
          <label className="text-xs text-text-3">
            Date
            <input type="date" value={scheduledAt.slice(0, 10)} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1 min-h-[40px] w-full rounded border border-line bg-ink-700 px-2 text-sm" />
          </label>
          <label className="text-xs text-text-3">
            Home score
            <input type="number" min={0} value={homeScore} onChange={(event) => setHomeScore(Number(event.target.value))} className="mt-1 min-h-[40px] w-full rounded border border-line bg-ink-700 px-2 text-sm" />
          </label>
          <label className="text-xs text-text-3">
            Away score
            <input type="number" min={0} value={awayScore} onChange={(event) => setAwayScore(Number(event.target.value))} className="mt-1 min-h-[40px] w-full rounded border border-line bg-ink-700 px-2 text-sm" />
          </label>
        </div>

        <div className="rounded-lg border border-line bg-ink-800 p-3">
          <p className="text-xs text-text-3">Period scores</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {periods.map((period, index) => (
              <div key={period.label} className="flex items-center gap-1 text-xs">
                <input
                  value={period.label}
                  onChange={(event) => setPeriods((current) => current.map((p, i) => (i === index ? { ...p, label: event.target.value } : p)))}
                  className="w-10 rounded border border-line bg-ink-700 px-1 py-1 text-center"
                />
                <input type="number" min={0} value={period.homeScore} onChange={(event) => setPeriods((current) => current.map((p, i) => (i === index ? { ...p, homeScore: Number(event.target.value) } : p)))} className="w-12 rounded border border-line bg-ink-700 px-1 py-1 text-center tabular-nums" />
                <span className="text-text-3">-</span>
                <input type="number" min={0} value={period.awayScore} onChange={(event) => setPeriods((current) => current.map((p, i) => (i === index ? { ...p, awayScore: Number(event.target.value) } : p)))} className="w-12 rounded border border-line bg-ink-700 px-1 py-1 text-center tabular-nums" />
              </div>
            ))}
          </div>
        </div>

        {renderTeam("home", home)}
        {renderTeam("away", away)}

        {state.report ? (
          <section aria-labelledby="checksum-heading" className="rounded-lg border border-line bg-ink-800 p-3">
            <h2 id="checksum-heading" className="text-sm font-semibold">
              Checksums {state.report.ok ? <span className="text-success">- all pass</span> : <span className="text-danger">- {state.report.checks.filter((c) => !c.ok).length} failing</span>}
            </h2>
            <ul className="mt-2 space-y-1 text-xs">
              {state.report.checks.map((check) => (
                <li key={check.key} className={check.ok ? "text-text-3" : "text-danger"} data-check={check.ok ? "ok" : "fail"}>
                  {check.ok ? "PASS" : "FAIL"} Â· {check.label}
                  {!check.ok ? (
                    <span className="text-text-3">
                      {" "}
                      (sheet says {String(check.expected)}, rows say {String(check.actual)})
                      {check.detail ? ` - ${check.detail}` : ""}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <label className="block text-xs text-text-3">
          Reviewer note (optional)
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="mt-1 min-h-[40px] w-full rounded border border-line bg-ink-700 px-2 text-sm" />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" name="intent" value="check" disabled={pending} className="min-h-[40px] rounded-md border border-line px-4 text-sm">
            Check cells
          </button>
          <button type="submit" name="intent" value="approve" disabled={pending} className="min-h-[40px] rounded-md bg-brand-400 px-4 text-sm font-bold text-ink-900">
            Approve
          </button>
          <span className="mx-2 h-6 w-px bg-line" aria-hidden />
          <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Reason (required to reject)" className="min-h-[40px] flex-1 rounded border border-line bg-ink-700 px-2 text-sm" />
          <button type="submit" name="intent" value="reject" disabled={pending} className="min-h-[40px] rounded-md border border-danger/40 px-4 text-sm text-danger">
            Reject
          </button>
        </div>
        {initial.status === "INGESTED" ? (
          <p className="text-xs text-text-3">This import has already been ingested; the values above are the record of what was approved.</p>
        ) : null}
      </form>
    </div>
  );
}
