import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTracking, type TrackSpan, type GroundTruthIdentitySpan } from "./tracking-metrics";

test("evaluateTracking: a single continuous track for a continuously-present person has zero switches/fragmentations", () => {
  const tracks: TrackSpan[] = [{ trackId: "TRACK_001", startVideoTimeMs: 0, endVideoTimeMs: 10000 }];
  const gt: GroundTruthIdentitySpan[] = [{ personLabel: "Player A", startVideoTimeMs: 0, endVideoTimeMs: 10000 }];
  const result = evaluateTracking(tracks, gt);
  assert.equal(result.idSwitches, 0);
  assert.equal(result.fragmentations, 0);
  assert.equal(result.trackCount, 1);
});

test("evaluateTracking: two different track IDs covering one continuously-present person count as a switch AND a fragmentation", () => {
  const tracks: TrackSpan[] = [
    { trackId: "TRACK_001", startVideoTimeMs: 0, endVideoTimeMs: 4000 },
    { trackId: "TRACK_002", startVideoTimeMs: 4200, endVideoTimeMs: 10000 },
  ];
  const gt: GroundTruthIdentitySpan[] = [{ personLabel: "Player A", startVideoTimeMs: 0, endVideoTimeMs: 10000 }];
  const result = evaluateTracking(tracks, gt);
  assert.equal(result.idSwitches, 1);
  assert.equal(result.fragmentations, 1);
});

test("evaluateTracking: a new track ID after the person genuinely left and returned is a switch but NOT a fragmentation", () => {
  const tracks: TrackSpan[] = [
    { trackId: "TRACK_001", startVideoTimeMs: 0, endVideoTimeMs: 4000 },
    { trackId: "TRACK_002", startVideoTimeMs: 8000, endVideoTimeMs: 12000 },
  ];
  const gt: GroundTruthIdentitySpan[] = [
    { personLabel: "Player A", startVideoTimeMs: 0, endVideoTimeMs: 4000 },
    { personLabel: "Player A", startVideoTimeMs: 8000, endVideoTimeMs: 12000 },
  ]; // gap 4000-8000 the person was genuinely off-screen per ground truth
  const result = evaluateTracking(tracks, gt);
  assert.equal(result.idSwitches, 1);
  assert.equal(result.fragmentations, 0);
});

test("evaluateTracking: average track duration is computed correctly", () => {
  const tracks: TrackSpan[] = [
    { trackId: "TRACK_001", startVideoTimeMs: 0, endVideoTimeMs: 1000 },
    { trackId: "TRACK_002", startVideoTimeMs: 0, endVideoTimeMs: 3000 },
  ];
  const result = evaluateTracking(tracks, []);
  assert.equal(result.averageTrackDurationMs, 2000);
});

test("evaluateTracking: zero tracks produces zero average duration, not NaN", () => {
  const result = evaluateTracking([], []);
  assert.equal(result.averageTrackDurationMs, 0);
  assert.equal(result.trackCount, 0);
});
