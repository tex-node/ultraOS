import assert from "node:assert/strict";
import test from "node:test";
import { qualifiesForEventLevel, qualifiesForFullUltra, type CapabilityQualificationInput } from "./capability-qualification";

function event(overrides: Partial<CapabilityQualificationInput>): CapabilityQualificationInput {
  return { eventType: "SHOT_MADE", basePointValue: 2, multiplier: 1, isUltraTime: false, ...overrides };
}

test("qualifiesForEventLevel is false with no events, true with at least one", () => {
  assert.equal(qualifiesForEventLevel([]), false);
  assert.equal(qualifiesForEventLevel([event({})]), true);
});

test("qualifiesForFullUltra is false when there are no scoring events, even if other events exist", () => {
  assert.equal(qualifiesForFullUltra([event({ eventType: "ASSIST", basePointValue: null, multiplier: null })]), false);
});

test("qualifiesForFullUltra is true when every scoring event has complete provenance, including misses", () => {
  const events = [
    event({ eventType: "SHOT_MADE", basePointValue: 3, multiplier: 1 }),
    event({ eventType: "SHOT_MISSED", basePointValue: 4, multiplier: 1 }),
    event({ eventType: "FREE_THROW_MADE", basePointValue: 1, multiplier: 2, isUltraTime: true }),
  ];
  assert.equal(qualifiesForFullUltra(events), true);
});

test("qualifiesForFullUltra is false if any scoring event is missing basePointValue or multiplier", () => {
  const events = [
    event({ eventType: "SHOT_MADE", basePointValue: 2, multiplier: 1 }),
    event({ eventType: "SCORE", basePointValue: null, multiplier: null }), // a manual scoreboard correction, e.g.
  ];
  assert.equal(qualifiesForFullUltra(events), false);
});

test("qualifiesForFullUltra does not require an actual 4PT or Ultra Time occurrence - only complete provenance", () => {
  const events = [event({ eventType: "SHOT_MADE", basePointValue: 2, multiplier: 1, isUltraTime: false })];
  assert.equal(qualifiesForFullUltra(events), true);
});
