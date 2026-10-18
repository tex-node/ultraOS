import type { SelectionAdvice, SelectionCandidateResult } from "@/lib/coaching/selection";
import { Card, ConfidenceChip, Num, SectionTitle } from "./ui";

// The Selection / Rotation Advisor's view (P15 I2-b deliverable 2). A plain server component: no
// hooks, no client JS, so it renders identically in the browser and in the jsdom/static tests.
//
// The one rule this file exists to enforce: THE UI MUST NOT OFFER ADVICE IT DOES NOT TRUST. When the
// advisor returns INSUFFICIENT_DATA - no player has a qualifying sample, e.g. a club with three games
// against C1's four-game gate - the page still shows the whole ranked list (a coach needs the squad),
// but no START/ROTATE/BENCH label appears anywhere, and the banner says why. The engine still has to
// emit a `recommendation` field per the output contract; this view deliberately ignores it in that
// state rather than trusting it.
//
// Two degradations, handled separately because they mean different things:
//   - whole response INSUFFICIENT_DATA  -> no labels at all (above).
//   - matchupState DEGRADED / INSUFFICIENT_DATA with a usable overall -> labels still shown (form,
//     availability and load are real evidence), but Matchup reads N/A and the banner names what is
//     missing and links to the squad setup page for the club whose data is absent.

export type SelectionViewProps = {
  seasonClubId: string;
  seasonClubName: string;
  opponentSeasonClubId: string;
  opponentName: string;
  fixture: { scheduledAt: Date; isHome: boolean; status: string };
  advice: SelectionAdvice;
  // C1's minimum games for any dimension (developmentConfig.minGames) - passed in so the banner can
  // say "X of 4 required" instead of hard-coding a number in two places.
  minGames: number;
  // Where to send the coach to fix the opponent's missing position/height data.
  opponentSetupHref: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

const RECOMMENDATION_LABEL: Record<SelectionCandidateResult["recommendation"], string> = {
  START: "START",
  ROTATE: "ROTATE",
  BENCH: "BENCH",
};

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-text-3">{label}</span>
      <span className="font-semibold text-text-1">{value == null ? "N/A" : <Num>{value}</Num>}</span>
    </div>
  );
}

function CandidateRow({ candidate, rank, showRecommendation }: { candidate: SelectionCandidateResult; rank: number; showRecommendation: boolean }) {
  return (
    <li data-player={candidate.playerId} className="rounded-md border border-line-subtle bg-ink-700 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-text-1">
          <span className="mr-2 text-text-3">{rank}.</span>
          {candidate.jerseyNumber != null ? <span className="mr-1 text-text-3">#{candidate.jerseyNumber}</span> : null}
          {candidate.name}
          {candidate.position ? <span className="ml-2 text-xs font-normal text-text-3">{candidate.position}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-text-3">
            <Num>{candidate.gamesPlayed}</Num> games
          </span>
          {candidate.hasFormSample ? (
            <span className="text-sm font-bold text-brand-300">
              <Num>{candidate.overallScore}</Num>
            </span>
          ) : (
            // A player without a form sample has an overall computed from availability/load alone.
            // Showing that number would read as a quality score it is not, so it is shown as a dash
            // and the reason is spelled out.
            <span className="text-xs text-text-3" title="No form sample yet - this player is ranked below players who have one">
              no form sample
            </span>
          )}
          {showRecommendation ? (
            <span
              data-recommendation={candidate.recommendation}
              className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                candidate.recommendation === "START"
                  ? "bg-brand-400/20 text-brand-300"
                  : candidate.recommendation === "ROTATE"
                    ? "bg-info/20 text-info"
                    : "bg-ink-600 text-text-3"
              }`}
            >
              {RECOMMENDATION_LABEL[candidate.recommendation]}
            </span>
          ) : null}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        <Score label="Form" value={candidate.formScore} />
        <Score label="Matchup" value={candidate.matchupScore} />
        <Score label="Availability" value={candidate.availabilityScore} />
        <Score label="Load" value={candidate.loadScore} />
      </div>

      {candidate.whyNot ? <p className="mt-2 text-xs text-text-2">{candidate.whyNot}</p> : null}

      {candidate.evidence.length > 0 ? (
        <details className="mt-2 text-xs text-text-2">
          <summary className="cursor-pointer select-none text-info">Evidence</summary>
          <ul className="mt-2 space-y-2">
            {candidate.evidence.map((e) => (
              <li key={e.metric} className="rounded border border-line-subtle p-2">
                <p className="flex items-baseline justify-between gap-2 text-text-1">
                  <span className="font-semibold">{e.metric}</span>
                  <ConfidenceChip confidence={e.confidence} />
                </p>
                <p className="mt-1">
                  Value: {e.playerValueLabel} · percentile <Num>{e.percentile}</Num>
                </p>
                <p className="text-text-3">
                  Baseline: {e.baseline.label} (n=<Num>{e.baseline.peerCount}</Num>, median <Num>{e.baseline.medianLabel}</Num>)
                </p>
                <p className="text-text-3">Sample: {e.sample.label}</p>
                <p className="text-text-3">Gate: {e.gate}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

export function SelectionView({ seasonClubId, seasonClubName, opponentSeasonClubId, opponentName, fixture, advice, minGames, opponentSetupHref }: SelectionViewProps) {
  const insufficient = advice.status === "INSUFFICIENT_DATA";
  const matchupDegraded = advice.matchupState === "DEGRADED";
  const matchupMissing = advice.matchupState === "INSUFFICIENT_DATA";
  // No labels when the overall advice is not trustworthy (see the header).
  const showRecommendation = !insufficient;

  const starters = advice.candidates.filter((c) => c.recommendation === "START");
  const rotation = advice.candidates.filter((c) => c.recommendation === "ROTATE");
  const bench = advice.candidates.filter((c) => c.recommendation === "BENCH");
  const maxGames = advice.candidates.reduce((m, c) => Math.max(m, c.gamesPlayed), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-1">Rotation</h1>
      <p className="mt-1 text-sm text-text-2">
        {seasonClubName} vs {opponentName} · {dateFormatter.format(fixture.scheduledAt)} · {fixture.isHome ? "home" : "away"}
      </p>

      {insufficient ? (
        <div role="status" data-state="insufficient" className="mt-4 rounded-md border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
          <p className="font-bold">
            Insufficient games to generate a recommendation (<Num>{maxGames}</Num> of <Num>{minGames}</Num> required).
          </p>
          <p className="mt-1">
            Here is the raw data. No start/rotation advice is shown, because the sample cannot support one - every
            player&apos;s form reads 0 until they have played {minGames} games this season.
          </p>
        </div>
      ) : null}

      {!insufficient && matchupDegraded ? (
        <div role="status" data-state="degraded" className="mt-4 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          <p className="font-bold">Matchup is degraded: the opponent&apos;s player positions are not recorded.</p>
          <p className="mt-1">
            Matchup therefore scores defensive assignments only, and is shown as a number rather than a position
            comparison.{" "}
            <a href={opponentSetupHref} className="underline">
              Add {opponentName}&apos;s positions and heights
            </a>{" "}
            to restore the full comparison.
          </p>
        </div>
      ) : null}

      {!insufficient && matchupMissing ? (
        <div role="status" data-state="no-matchup" className="mt-4 rounded-md border border-line bg-ink-700 p-3 text-sm text-text-2">
          <p className="font-bold text-text-1">Matchup is N/A for this game.</p>
          <p className="mt-1">
            {advice.notes[0] ?? "There is no opponent game plan to compare against yet."} The overall score is renormalized
            over form, availability and load, so players are not punished for a missing component.
          </p>
        </div>
      ) : null}

      <SectionTitle>
        {insufficient ? "Ranked squad (raw data)" : `Starters (${starters.length})`}
      </SectionTitle>
      <ul className="space-y-2">
        {(insufficient ? advice.candidates : starters).map((candidate, index) => (
          <CandidateRow key={candidate.playerId} candidate={candidate} rank={index + 1} showRecommendation={showRecommendation} />
        ))}
      </ul>

      {!insufficient && rotation.length > 0 ? (
        <>
          <SectionTitle>Rotation ({rotation.length})</SectionTitle>
          <ul className="space-y-2">
            {rotation.map((candidate, index) => (
              <CandidateRow key={candidate.playerId} candidate={candidate} rank={starters.length + index + 1} showRecommendation={showRecommendation} />
            ))}
          </ul>
        </>
      ) : null}

      {!insufficient && bench.length > 0 ? (
        <>
          <SectionTitle>Bench ({bench.length})</SectionTitle>
          <ul className="space-y-2">
            {bench.map((candidate, index) => (
              <CandidateRow key={candidate.playerId} candidate={candidate} rank={starters.length + rotation.length + index + 1} showRecommendation={showRecommendation} />
            ))}
          </ul>
        </>
      ) : null}

      {advice.notes.length > 0 ? (
        <Card className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-text-3">Notes</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-text-2">
            {advice.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="mt-4 text-xs text-text-3">
        Ranks are the advisor&apos;s, not a selection. Form is the last five games on the development engine&apos;s own
        dimensions; matchup comes from the game plan&apos;s defensive assignments
        {advice.squadPositionCoverage ? ` (${advice.squadPositionCoverage.usable}/${advice.squadPositionCoverage.total} squad players have a recorded position)` : ""}.
      </p>
      <p className="mt-2 text-xs">
        <a href={`/coaching/${seasonClubId}/opponents/${opponentSeasonClubId}`} className="text-info underline">
          Open the full game plan for {opponentName}
        </a>
      </p>
    </div>
  );
}
