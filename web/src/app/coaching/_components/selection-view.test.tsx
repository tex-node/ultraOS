import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectionView, type SelectionViewProps } from "./selection-view";
import type { SelectionAdvice, SelectionCandidateResult, SelectionEvidence } from "@/lib/coaching/selection";

// The selection view's contract. Rendered with react-dom/server rather than into jsdom: this is a
// server component with no hooks and no browser APIs, so the static render IS the production render
// (and it avoids installing a DOM just to read markup - see docs/patterns/component-testing.md for
// when a real jsdom render is the right call instead, i.e. when a browser event is under test).
//
// The test that matters most is the first one: an INSUFFICIENT_DATA advice must never render a
// START/ROTATE/BENCH label. The advisor still has to emit a `recommendation` per its output contract;
// the view is what refuses to show advice the engine does not trust.

const evidence = (metric: string): SelectionEvidence => ({
  metric,
  playerValue: 61,
  playerValueLabel: "61",
  baseline: { kind: "POSITION_PEERS", label: "Guard peers", peerCount: 8, median: 55, medianLabel: "55" },
  percentile: 61,
  sample: { games: 6, attempts: null, label: "6 games" },
  gate: "4+ games",
  confidence: "MEDIUM",
  source: "BOX_SCORE",
});

function candidate(overrides: Partial<SelectionCandidateResult> & { playerId: string; name: string }): SelectionCandidateResult {
  return {
    jerseyNumber: 7,
    position: "Point guard",
    positionGroup: "GUARD",
    gamesPlayed: 6,
    minutesPerGame: 28,
    formScore: 60,
    formConfidence: "MEDIUM",
    matchupScore: 55,
    matchupState: "OK",
    availabilityScore: 70,
    loadScore: 80,
    overallScore: 62,
    hasFormSample: true,
    recommendation: "START",
    evidence: [evidence("Role-weighted form, last 5 games")],
    whyNot: null,
    ...overrides,
  };
}

function advice(overrides: Partial<SelectionAdvice> = {}): SelectionAdvice {
  return {
    status: "OK",
    insufficientReason: null,
    squadPositionCoverage: { usable: 8, total: 8 },
    matchupState: "OK",
    starterCount: 2,
    candidates: [
      candidate({ playerId: "p1", name: "Alpha One", overallScore: 70 }),
      candidate({ playerId: "p2", name: "Beta Two", overallScore: 60, recommendation: "START" }),
      candidate({ playerId: "p3", name: "Gamma Three", overallScore: 50, recommendation: "ROTATE" }),
      candidate({ playerId: "p4", name: "Delta Four", overallScore: 40, recommendation: "BENCH" }),
    ],
    notes: [],
    ...overrides,
  };
}

const props = (overrides: Partial<SelectionViewProps> = {}): SelectionViewProps => ({
  seasonClubId: "sc-1",
  seasonClubName: "Home Club",
  opponentSeasonClubId: "sc-2",
  opponentName: "Opponent Club",
  fixture: { scheduledAt: new Date(Date.UTC(2026, 10, 1, 18, 0)), isHome: true, status: "SCHEDULED" },
  advice: advice(),
  minGames: 4,
  opponentSetupHref: "/coaching/sc-2/squad/setup",
  ...overrides,
});

test("INSUFFICIENT_DATA: renders the ranked list with NO start/rotate/bench labels and a banner that says why", () => {
  const html = renderToStaticMarkup(
    <SelectionView
      {...props({
        advice: advice({
          status: "INSUFFICIENT_DATA",
          insufficientReason: "Not enough recorded games for any player in this squad.",
          // The engine still emits recommendations - the view must ignore them.
          candidates: [
            candidate({ playerId: "p1", name: "Alpha One", formScore: 0, overallScore: 40, hasFormSample: false, recommendation: "START", gamesPlayed: 3 }),
            candidate({ playerId: "p2", name: "Beta Two", formScore: 0, overallScore: 30, hasFormSample: false, recommendation: "ROTATE", gamesPlayed: 2 }),
          ],
          notes: ["No player has a qualifying sample yet - form is 0 for everyone and the ranking is effectively neutral."],
        }),
      })}
    />,
  );

  // Assertions read the rendered TEXT, not the markup: the components wrap numbers in spans, and a
  // regex over raw HTML would be testing Tailwind's class names rather than what a coach sees.
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Insufficient games to generate a recommendation \( 3 of 4 required\)/);
  assert.match(text, /raw data/i);

  // The critical assertion: no advice labels, anywhere - not as text, not as a data attribute.
  assert.doesNotMatch(text, /\bSTART\b/, "the view must not render a START label when the advice is INSUFFICIENT_DATA");
  assert.doesNotMatch(text, /\bROTATE\b/);
  assert.doesNotMatch(text, /\bBENCH\b/);
  assert.doesNotMatch(html, /data-recommendation/);

  // ...but the raw data a coach needs is still there, in rank order.
  assert.match(text, /Ranked squad \(raw data\)/);
  assert.ok(html.indexOf("Alpha One") < html.indexOf("Beta Two"), "the list stays ranked");
  assert.match(text, /Form/);
  assert.match(text, /Matchup/);
  // A player with no sample must not display an overall score as if it were a quality rating.
  assert.match(text, /no form sample/);
});

test("OK: groups the list into Starters, Rotation and Bench with labels and scores", () => {
  const html = renderToStaticMarkup(<SelectionView {...props()} />);

  assert.match(html, /Starters \(2\)/);
  assert.match(html, /Rotation \(1\)/);
  assert.match(html, /Bench \(1\)/);
  assert.match(html, /data-recommendation="START"/);
  assert.match(html, /data-recommendation="ROTATE"/);
  assert.match(html, /data-recommendation="BENCH"/);
  assert.match(html, /No plan|Matchup|Form/);
  assert.doesNotMatch(html, /Insufficient games to generate a recommendation/);
});

test("DEGRADED: names the missing opponent fields and links to that club's squad setup", () => {
  const html = renderToStaticMarkup(
    <SelectionView
      {...props({
        advice: advice({ matchupState: "DEGRADED", notes: ["Matchup is based on assignments only: the opponent's threat positions are not recorded."] }),
      })}
    />,
  );

  assert.match(html, /data-state="degraded"/);
  assert.match(html, /positions are not recorded/i);
  assert.match(html, /href="\/coaching\/sc-2\/squad\/setup"/);
  // Labels are still legitimate: form/availability/load are real evidence even with a degraded matchup.
  assert.match(html, /data-recommendation="START"/);
});

test("no matchup: shows N/A for Matchup and explains the renormalization instead of scoring a zero", () => {
  const html = renderToStaticMarkup(
    <SelectionView
      {...props({
        advice: advice({
          matchupState: "INSUFFICIENT_DATA",
          candidates: advice().candidates.map((c) => ({ ...c, matchupScore: null, matchupState: "INSUFFICIENT_DATA" as const })),
          notes: ["Matchup is excluded from every overall score: no opponent game plan or no recorded positions."],
        }),
      })}
    />,
  );

  assert.match(html, /data-state="no-matchup"/);
  assert.match(html, /Matchup is N\/A/);
  assert.match(html, /renormalized/);
  assert.match(html, /N\/A/, "the per-player matchup score renders as N/A");
});

test("evidence is rendered per player, including the sample and gate", () => {
  const html = renderToStaticMarkup(<SelectionView {...props()} />);
  assert.match(html, /Role-weighted form, last 5 games/);
  assert.match(html, /percentile/);
  assert.match(html, /Baseline/);
  assert.match(html, /Gate: 4\+ games/);
});
