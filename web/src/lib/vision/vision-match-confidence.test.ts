import assert from "node:assert/strict";
import test from "node:test";
import { scoreMatch, type MatchEvidence } from "./vision-match-confidence";

function evidence(overrides: Partial<MatchEvidence>): MatchEvidence {
  return { temporalErrorMs: null, teamMatch: null, playerMatch: null, eventTypeMatch: null, shotResultMatch: null, ...overrides };
}

test("scoreMatch: all evidence unavailable produces NO_MATCH with score 0", () => {
  const result = scoreMatch(evidence({}));
  assert.equal(result.score, 0);
  assert.equal(result.band, "NO_MATCH");
});

test("scoreMatch: strong agreement across every factor produces STRONG_MATCH", () => {
  const result = scoreMatch(evidence({ temporalErrorMs: 100, teamMatch: true, playerMatch: true, eventTypeMatch: true, shotResultMatch: true }));
  assert.equal(result.band, "STRONG_MATCH");
  assert.ok(result.score >= 0.75);
});

test("scoreMatch: a confirmed team mismatch is disqualifying regardless of temporal proximity", () => {
  const result = scoreMatch(evidence({ temporalErrorMs: 0, teamMatch: false, playerMatch: true, eventTypeMatch: true }));
  assert.equal(result.band, "NO_MATCH");
});

test("scoreMatch: a confirmed event-type mismatch is disqualifying", () => {
  const result = scoreMatch(evidence({ temporalErrorMs: 0, teamMatch: true, eventTypeMatch: false }));
  assert.equal(result.band, "NO_MATCH");
});

test("scoreMatch: temporal proximity decays smoothly and reaches zero at 2x tolerance", () => {
  const inTolerance = scoreMatch(evidence({ temporalErrorMs: 500 }), 1500);
  const atTolerance = scoreMatch(evidence({ temporalErrorMs: 1500 }), 1500);
  const beyond2x = scoreMatch(evidence({ temporalErrorMs: 3500 }), 1500);
  assert.ok(inTolerance.score > 0);
  assert.ok(atTolerance.score > 0);
  assert.equal(beyond2x.score, 0);
});

test("scoreMatch: partial evidence (team+player match, no timing) lands in a plausible mid band", () => {
  const result = scoreMatch(evidence({ teamMatch: true, playerMatch: true }));
  assert.ok(result.band === "POSSIBLE_MATCH" || result.band === "AMBIGUOUS");
});

test("scoreMatch: score is always clamped to [0, 1]", () => {
  const result = scoreMatch(evidence({ temporalErrorMs: 0, teamMatch: true, playerMatch: true, eventTypeMatch: true, shotResultMatch: true }));
  assert.ok(result.score <= 1 && result.score >= 0);
});
