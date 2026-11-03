import assert from "node:assert/strict";
import test from "node:test";
import type { SelectionCandidateResult, SelectionEvidence } from "@/lib/coaching/selection";
import {
  fatigueBand,
  fatigueLabel,
  formatFoulsPer36,
  foulsPer36,
  matchFitPercent,
  whyBench,
  whyStart,
} from "@/lib/coaching/selection-presentation";

// v37: the Selection Advisor's screen is meant to be evidence, not decoration. These pin the two ways it could lie - showing a
// number the engine never measured, and claiming a reason the evidence does not support.
const evidence = (over: Partial<SelectionEvidence>): SelectionEvidence => ({
  metric: "Fouls per 36 minutes",
  playerValue: 3.4,
  playerValueLabel: "3.4 per 36 min",
  baseline: { kind: "POSITION_PEERS", label: "guards", peerCount: 12, median: 3.1, medianLabel: "3.1" },
  percentile: 30,
  sample: { games: 5, attempts: null, label: "5 games" },
  gate: "> 80 minutes",
  confidence: "MEDIUM",
  source: "BOX_SCORE",
  ...over,
});

const candidate = (over: Partial<SelectionCandidateResult> = {}): SelectionCandidateResult => ({
  playerId: "p1",
  name: "Tunde Bakare",
  jerseyNumber: 3,
  position: "PG",
  positionGroup: "GUARD",
  gamesPlayed: 5,
  minutesPerGame: 28,
  formScore: 74,
  formConfidence: "HIGH",
  matchupScore: 88,
  matchupState: "OK",
  availabilityScore: 62,
  loadScore: 55,
  overallScore: 71,
  hasFormSample: true,
  recommendation: "START",
  evidence: [evidence({})],
  whyNot: null,
  ...over,
});

test("load bands follow the engine's 0..100 freshness scale", () => {
  assert.equal(fatigueBand(100), "LOW");
  assert.equal(fatigueBand(70), "LOW");
  assert.equal(fatigueBand(69), "MODERATE");
  assert.equal(fatigueBand(40), "MODERATE");
  assert.equal(fatigueBand(39), "HIGH");
  assert.equal(fatigueBand(null), "UNKNOWN");
  assert.equal(fatigueLabel("UNKNOWN"), "No load sample");
});

test("a player with no minutes has NO fouls-per-36, rather than a zero that reads as 'never fouls'", () => {
  const noMinutes = candidate({
    evidence: [evidence({ playerValue: 0, playerValueLabel: "not applicable - no minutes recorded", percentile: 50 })],
  });
  assert.equal(foulsPer36(noMinutes), null);
  assert.equal(formatFoulsPer36(noMinutes), "—");
});

test("fouls per 36 is shown as printed when the engine measured it", () => {
  assert.equal(foulsPer36(candidate()), 3.4);
  assert.equal(formatFoulsPer36(candidate()), "3.4");
});

test("why-start is built from strong evidence only, and says so when there is none", () => {
  const strong = candidate({ evidence: [evidence({ percentile: 82, playerValueLabel: "1.6 per 36 min" })] });
  const reasons = whyStart(strong);
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /82th pct/);

  const weak = candidate({ evidence: [evidence({ percentile: 20 })] });
  assert.deepEqual(whyStart(weak), [], "a player with only weak evidence must not be given a reason to start");

  const noSample = candidate({ evidence: [], hasFormSample: false });
  assert.deepEqual(whyStart(noSample), ["No measured sample yet in the form window"]);
});

test("why-bench carries weak evidence and the engine's own why-not line, and is empty when nothing argues against", () => {
  const withWeak = candidate({ evidence: [evidence({ percentile: 12 })], whyNot: "trails the next player on matchup" });
  const reasons = whyBench(withWeak);
  assert.equal(reasons.length, 2);
  assert.match(reasons[0], /12th pct/);
  assert.match(reasons[1], /trails the next player/);

  assert.deepEqual(whyBench(candidate({ evidence: [evidence({ percentile: 80 })], whyNot: null })), []);
});

test("match fit is rounded, and absent when the engine could not rate the matchup", () => {
  assert.equal(matchFitPercent(candidate({ matchupScore: 87.6 })), 88);
  assert.equal(matchFitPercent(candidate({ matchupScore: null, matchupState: "INSUFFICIENT_DATA" })), null);
});
