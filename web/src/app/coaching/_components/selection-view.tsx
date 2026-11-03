import Link from "next/link";
import type { SelectionAdvice, SelectionCandidateResult } from "@/lib/coaching/selection";
import {
  fatigueBand,
  fatigueLabel,
  formatFoulsPer36,
  matchFitPercent,
  whyBench,
  whyStart,
} from "@/lib/coaching/selection-presentation";
import { Card, ConfidenceChip, Num, SectionTitle } from "./ui";

// The Selection / Rotation Advisor (P15 I2-b; redesigned in v37).
//
// WHAT CHANGED. The screen used to be one ranked list. The redesign the owner asked for is a coaching decision surface:
// the recommended lineup, the workload/fatigue matrix, and - for one selected player - the evidence FOR and AGAINST starting
// him. It is the same engine, the same numbers; the difference is what a coach can see at a glance.
//
// TWO INVARIANTS CARRIED OVER, deliberately:
//   1. THE UI MUST NOT OFFER ADVICE IT DOES NOT TRUST. When the advisor returns INSUFFICIENT_DATA no START label appears
//      anywhere, and the banner says why. The engine still emits a recommendation per its output contract; this view ignores
//      it in that state rather than trusting it.
//   2. Selection is URL state (`?inspect=<playerId>`), not client state. The screen renders identically in a browser, in the
//      static tests and in print, and a coach can send "look at this player" to another coach as a link.
//
// NOTHING IS FAKE. Every number on this page comes from SelectionCandidateResult. Where the engine had no sample (a player
// with no minutes, a matchup it could not rate) the screen says so - it never prints a plausible-looking default.

export type SelectionViewProps = {
  seasonClubId: string;
  seasonClubName: string;
  opponentSeasonClubId: string;
  opponentName: string;
  fixture: { scheduledAt: Date; isHome: boolean; status: string };
  advice: SelectionAdvice;
  minGames: number;
  opponentSetupHref: string;
  /** Which player's evidence panel is open (`?inspect=`), if any. */
  inspectedPlayerId?: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

const BAND_TONE: Record<ReturnType<typeof fatigueBand>, string> = {
  LOW: "border-success/40 text-success",
  MODERATE: "border-warn/40 text-warn",
  HIGH: "border-danger/50 text-danger",
  UNKNOWN: "border-line-strong text-text-3",
};

function bandChip(candidate: SelectionCandidateResult) {
  const band = fatigueBand(candidate.loadScore);
  return (
    <span data-chip="fatigue" className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BAND_TONE[band]}`}>
      {fatigueLabel(band)}
    </span>
  );
}

function recommendationChip(candidate: SelectionCandidateResult, trusted: boolean) {
  if (!trusted) return <span className="text-[10px] uppercase tracking-wide text-text-3">unrated</span>;
  const tone =
    candidate.recommendation === "START" ? "border-success/40 text-success" : candidate.recommendation === "ROTATE" ? "border-warn/40 text-warn" : "border-line-strong text-text-3";
  return (
    <span
      data-chip="recommendation"
      data-recommendation={candidate.recommendation}
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {candidate.recommendation}
    </span>
  );
}

function StatBlock({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-900/60 p-3">
      <p className="text-[10px] uppercase tracking-[.15em] text-text-3">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-text-1">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-text-3">{hint}</p> : null}
    </div>
  );
}

export function SelectionView({ seasonClubName, opponentName, fixture, advice, minGames, opponentSetupHref, inspectedPlayerId }: SelectionViewProps) {
  const trusted = advice.status === "OK";
  const starters = trusted ? advice.candidates.filter((candidate) => candidate.recommendation === "START") : [];
  const inspected = advice.candidates.find((candidate) => candidate.playerId === inspectedPlayerId) ?? starters[0] ?? advice.candidates[0];
  const candidates = advice.candidates;

  return (
    <div className="space-y-4">
      {/* Fixture header: who, when, and the squad this advice is for. */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[.2em] text-brand-400">Selection &amp; rotation advisor</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-text-1">
              {seasonClubName} <span className="text-text-3">v</span> {opponentName}
            </h1>
            <p className="mt-1 text-sm text-text-2">
              {dateFormatter.format(fixture.scheduledAt)} · {fixture.isHome ? "home" : "away"} · {fixture.status}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <StatBlock label="Squad" value={<Num>{candidates.length}</Num>} hint="players with a season record" />
            <StatBlock label="Recommended" value={trusted ? <Num>{starters.length}</Num> : "—"} hint={trusted ? "starters by rank" : "not enough sample"} />
            <StatBlock
              label="Matchup"
              value={advice.matchupState === "OK" ? "Rated" : advice.matchupState === "DEGRADED" ? "Partial" : "Matchup is N/A"}
              hint={advice.matchupState === "OK" ? "against this opponent" : "score renormalized over the components that exist"}
            />
          </div>
        </div>
      </Card>

      {!trusted ? (
        <Card className="border-warn/40 bg-warn/[.06]">
          <p className="text-sm font-semibold text-warn">Insufficient games to generate a recommendation</p>
          <p className="mt-1 text-sm text-text-2">{advice.insufficientReason ?? "The squad does not have a qualifying sample."}</p>
          <p className="mt-1 text-xs text-text-3">
            The ranked list below is still real - it shows what has been measured - but no player is given a verdict
            until at least {minGames} games are recorded.
          </p>
        </Card>
      ) : null}

      {advice.matchupState !== "OK" ? (
        <Card className="border-line-strong">
          <p className="text-sm font-semibold text-text-1">
            {advice.matchupState === "DEGRADED" ? "Matchup is partially rated" : "Matchup cannot be rated"}
          </p>
          <p className="mt-1 text-sm text-text-2">
            Form, availability and freshness are still measured. The opponent side is missing the position or height data the
            matchup component needs.
          </p>
          <Link href={opponentSetupHref} className="mt-2 inline-block text-xs text-info underline">
            Complete the {opponentName} squad setup
          </Link>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Recommended lineup */}
        <div className="lg:col-span-5">
          <SectionTitle>{trusted ? "Recommended lineup" : "Ranked squad"}</SectionTitle>
          <ol className="space-y-2">
            {candidates.map((candidate, index) => {
              const selected = inspected?.playerId === candidate.playerId;
              const fit = matchFitPercent(candidate);
              return (
                <li key={candidate.playerId} data-player={candidate.playerId}>
                  <Link
                    href={`?inspect=${candidate.playerId}`}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition ${
                      selected ? "border-brand-400/60 bg-brand-400/[.06]" : "border-line bg-ink-800 hover:border-line-strong"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-ink-900 text-xs font-bold text-brand-300">
                        {candidate.position ?? "—"}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-semibold text-text-1">
                          <span className="text-text-3">{index + 1}.</span>
                          <span className="truncate">{candidate.name}</span>
                          {candidate.jerseyNumber != null ? <span className="text-xs font-normal text-text-3">#{candidate.jerseyNumber}</span> : null}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-3">
                          <span>Form <Num>{candidate.formScore}</Num></span>
                          <span>Fit {fit === null ? "N/A" : `${fit}%`}</span>
                          <span>Fouls/36 {formatFoulsPer36(candidate)}</span>
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0">{recommendationChip(candidate, trusted)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Evidence for the selected player */}
        <div className="lg:col-span-7">
          <SectionTitle>Why / why not</SectionTitle>
          {inspected ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
                <div>
                  <h3 className="text-lg font-semibold text-text-1">
                    {inspected.jerseyNumber != null ? <span className="mr-1 text-text-3">#{inspected.jerseyNumber}</span> : null}
                    {inspected.name}
                  </h3>
                  <p className="text-xs text-text-3">
                    {inspected.position ?? "position unknown"} · <Num>{inspected.gamesPlayed}</Num> games in the window · overall{" "}
                    <Num>{inspected.overallScore}</Num>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {bandChip(inspected)}
                  <ConfidenceChip confidence={inspected.formConfidence} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatBlock label="Rolling form" value={<><Num>{inspected.formScore}</Num><span className="text-xs text-text-3"> / 100</span></>} hint="last 5 games" />
                <StatBlock label="Freshness" value={<><Num>{inspected.loadScore}</Num><span className="text-xs text-text-3"> / 100</span></>} hint="higher is fresher" />
                <StatBlock label="Fouls / 36" value={formatFoulsPer36(inspected)} hint="lower is better" />
                <StatBlock label="Match fit" value={matchFitPercent(inspected) === null ? "N/A" : `${matchFitPercent(inspected)}%`} hint="vs this opponent" />
              </div>

              <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-ink-900/60 text-text-3">
                    <tr>
                      <th className="px-3 py-1.5 font-semibold">Evidence</th>
                      <th className="px-3 py-1.5 font-semibold">Value</th>
                      <th className="px-3 py-1.5 font-semibold">Percentile</th>
                      <th className="px-3 py-1.5 font-semibold">Sample</th>
                      <th className="px-3 py-1.5 font-semibold">Gate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {inspected.evidence.map((row) => (
                      <tr key={`${row.metric}-${row.baseline.kind}`}>
                        <td className="px-3 py-1.5 text-text-2">{row.metric}</td>
                        <td className="px-3 py-1.5 text-text-1">{row.playerValueLabel}</td>
                        <td className="px-3 py-1.5 text-text-2">
                          <Num>{row.percentile}</Num>th percentile <span className="text-text-3">? baseline: {row.baseline.label}</span>
                        </td>
                        <td className="px-3 py-1.5 text-text-3">{row.sample.label}</td>
                        <td className="px-3 py-1.5 text-text-3">{row.gate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-success/25 bg-success/[.05] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-success">Why start</p>
                  <ul className="mt-1.5 space-y-1 text-xs text-text-2">
                    {whyStart(inspected).map((reason) => (
                      <li key={reason} className="flex gap-1.5"><span className="text-success">•</span><span>{reason}</span></li>
                    ))}
                    {whyStart(inspected).length === 0 ? <li className="text-text-3">No measured strength clears the evidence bar.</li> : null}
                  </ul>
                </div>
                <div className="rounded-lg border border-danger/25 bg-danger/[.05] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-danger">Risks &amp; limits</p>
                  <ul className="mt-1.5 space-y-1 text-xs text-text-2">
                    {whyBench(inspected).map((reason) => (
                      <li key={reason} className="flex gap-1.5"><span className="text-danger">•</span><span>{reason}</span></li>
                    ))}
                    {whyBench(inspected).length === 0 ? <li className="text-text-3">Nothing measured argues against starting him.</li> : null}
                  </ul>
                </div>
              </div>
            </Card>
          ) : (
            <Card quiet>
              <p className="text-sm text-text-2">No players on this squad yet.</p>
            </Card>
          )}
        </div>
      </div>

      {/* Workload matrix */}
      <div>
        <SectionTitle>Roster workload &amp; fatigue</SectionTitle>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-ink-900/60 text-text-3">
              <tr>
                <th className="px-3 py-2 font-semibold">Player</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Form (5g)</th>
                <th className="px-3 py-2 font-semibold">Freshness</th>
                <th className="px-3 py-2 font-semibold">Fatigue</th>
                <th className="px-3 py-2 font-semibold">Fouls/36</th>
                <th className="px-3 py-2 text-right font-semibold">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {candidates.map((candidate) => (
                <tr key={candidate.playerId} data-player={candidate.playerId} className="hover:bg-white/[.03]">
                  <td className="px-3 py-2 text-text-1">
                    {candidate.name} <span className="text-text-3">({candidate.position ?? "—"})</span>
                  </td>
                  <td className="px-3 py-2">{recommendationChip(candidate, trusted)}</td>
                  <td className="px-3 py-2 text-warn"><Num>{candidate.formScore}</Num></td>
                  <td className="px-3 py-2 text-text-2"><Num>{candidate.loadScore}</Num></td>
                  <td className="px-3 py-2">{bandChip(candidate)}</td>
                  <td className="px-3 py-2 text-text-2">{formatFoulsPer36(candidate)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`?inspect=${candidate.playerId}`} className="text-info underline-offset-2 hover:underline">
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {advice.notes.length > 0 ? (
        <Card quiet>
          <SectionTitle>How this was computed</SectionTitle>
          <ul className="space-y-1 text-xs text-text-2">
            {advice.notes.map((note) => (
              <li key={note} className="flex gap-1.5"><span className="text-text-3">•</span><span>{note}</span></li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-text-3">Window: last {shortDate.format(fixture.scheduledAt)} fixture, 5-game form, 14-day load.</p>
        </Card>
      ) : null}
    </div>
  );
}
