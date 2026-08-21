import assert from "node:assert/strict";
import test from "node:test";
import { computeGamePulse, type ScoringPoint } from "./live-game-pulse";

function point(overrides: Partial<ScoringPoint>): ScoringPoint {
  return { sequence: 1, period: 1, clockSeconds: 400, homeScore: 2, awayScore: 0, scoringTeam: "HOME", basePointValue: 2, multiplier: 1, isUltraTime: false, ...overrides };
}

test("computeGamePulse tracks score chronology through with no events", () => {
  const pulse = computeGamePulse([]);
  assert.deepEqual(pulse, { points: [], leadChanges: 0, ties: 0, largestLead: null, largestRun: null, currentRun: null, ultraTimeStart: null });
});

test("computeGamePulse counts a lead change only when the leader actually flips", () => {
  const pulse = computeGamePulse([
    point({ sequence: 1, homeScore: 2, awayScore: 0, scoringTeam: "HOME" }),
    point({ sequence: 2, homeScore: 2, awayScore: 3, scoringTeam: "AWAY" }),
    point({ sequence: 3, homeScore: 5, awayScore: 3, scoringTeam: "HOME" }),
  ]);
  assert.equal(pulse.leadChanges, 2);
  assert.equal(pulse.ties, 0);
});

test("computeGamePulse counts a team taking the lead right out of a tie as a real lead change (found in the G.19 rehearsal)", () => {
  // Away builds a 0-6 lead, home comes back to tie 6-6, then home takes a 9-6 lead - a real
  // rehearsal scenario that returned 0 lead changes before this fix, since the naive
  // "compare only to the immediately-prior point" version never flags TIE -> HOME as a change.
  const pulse = computeGamePulse([
    point({ sequence: 1, homeScore: 0, awayScore: 3, scoringTeam: "AWAY", basePointValue: 3 }),
    point({ sequence: 2, homeScore: 0, awayScore: 6, scoringTeam: "AWAY", basePointValue: 3 }),
    point({ sequence: 3, homeScore: 2, awayScore: 6, scoringTeam: "HOME" }),
    point({ sequence: 4, homeScore: 4, awayScore: 6, scoringTeam: "HOME" }),
    point({ sequence: 5, homeScore: 6, awayScore: 6, scoringTeam: "HOME" }),
    point({ sequence: 6, homeScore: 9, awayScore: 6, scoringTeam: "HOME", basePointValue: 3 }),
  ]);
  assert.equal(pulse.ties, 1);
  assert.equal(pulse.leadChanges, 1);
});

test("computeGamePulse counts a tie distinctly from a lead change", () => {
  const pulse = computeGamePulse([
    point({ sequence: 1, homeScore: 2, awayScore: 0 }),
    point({ sequence: 2, homeScore: 2, awayScore: 2, scoringTeam: "AWAY" }),
  ]);
  assert.equal(pulse.ties, 1);
  assert.equal(pulse.leadChanges, 0);
});

test("computeGamePulse reports the largest lead and which team held it", () => {
  const pulse = computeGamePulse([
    point({ sequence: 1, homeScore: 4, awayScore: 0 }),
    point({ sequence: 2, homeScore: 4, awayScore: 10, scoringTeam: "AWAY", basePointValue: 3 }),
  ]);
  assert.deepEqual(pulse.largestLead, { team: "AWAY", margin: 6 });
});

test("computeGamePulse tracks the current and largest scoring run, breaking on the opponent scoring", () => {
  const pulse = computeGamePulse([
    point({ sequence: 1, homeScore: 2, awayScore: 0, scoringTeam: "HOME" }),
    point({ sequence: 2, homeScore: 4, awayScore: 0, scoringTeam: "HOME" }),
    point({ sequence: 3, homeScore: 4, awayScore: 3, scoringTeam: "AWAY", basePointValue: 3 }),
  ]);
  assert.deepEqual(pulse.largestRun, { team: "HOME", points: 4, startSequence: 1, endSequence: 2 });
  assert.deepEqual(pulse.currentRun, { team: "AWAY", points: 3, startSequence: 3, endSequence: 3 });
});

test("computeGamePulse doubles run points for an Ultra Time multiplier", () => {
  const pulse = computeGamePulse([point({ sequence: 1, homeScore: 4, awayScore: 0, multiplier: 2, isUltraTime: true })]);
  assert.equal(pulse.currentRun?.points, 4);
});

test("computeGamePulse records the first Ultra Time point as ultraTimeStart, not a later one", () => {
  const pulse = computeGamePulse([
    point({ sequence: 1, period: 2, clockSeconds: 60, isUltraTime: true }),
    point({ sequence: 2, period: 2, clockSeconds: 30, isUltraTime: true }),
  ]);
  assert.deepEqual(pulse.ultraTimeStart, { period: 2, clockSeconds: 60 });
});

test("computeGamePulse leaves ultraTimeStart null when Ultra Time never occurred", () => {
  const pulse = computeGamePulse([point({ isUltraTime: false })]);
  assert.equal(pulse.ultraTimeStart, null);
});
