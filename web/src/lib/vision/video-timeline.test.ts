import assert from "node:assert/strict";
import test from "node:test";
import { videoTimeToGameTime, gameTimeToVideoTime, detectAnchorDrift, type TimelineAnchor } from "./video-timeline";

function anchor(overrides: Partial<TimelineAnchor>): TimelineAnchor {
  return { videoTimeMs: 0, period: 1, gameClockSeconds: 600, accepted: true, ...overrides };
}

test("videoTimeToGameTime returns UNAVAILABLE with no anchors", () => {
  assert.deepEqual(videoTimeToGameTime(1000, []), { value: null, confidence: "UNAVAILABLE" });
});

test("videoTimeToGameTime returns EXACT_ANCHOR at an exact anchor point", () => {
  const anchors = [anchor({ videoTimeMs: 5000, period: 1, gameClockSeconds: 400 })];
  const result = videoTimeToGameTime(5000, anchors);
  assert.equal(result.confidence, "EXACT_ANCHOR");
  assert.deepEqual(result.value, { period: 1, gameClockSeconds: 400 });
});

test("videoTimeToGameTime interpolates linearly between two same-period anchors", () => {
  const anchors = [
    anchor({ videoTimeMs: 0, period: 1, gameClockSeconds: 600 }),
    anchor({ videoTimeMs: 10000, period: 1, gameClockSeconds: 590 }), // 10s of video = 10s of clock
  ];
  const result = videoTimeToGameTime(5000, anchors);
  assert.equal(result.confidence, "INTERPOLATED");
  assert.equal(result.value?.period, 1);
  assert.equal(result.value?.gameClockSeconds, 595);
});

test("videoTimeToGameTime returns OUTSIDE_ALIGNED_RANGE outside any segment", () => {
  const anchors = [
    anchor({ videoTimeMs: 0, period: 1, gameClockSeconds: 600 }),
    anchor({ videoTimeMs: 10000, period: 1, gameClockSeconds: 590 }),
  ];
  const result = videoTimeToGameTime(50000, anchors);
  assert.equal(result.confidence, "OUTSIDE_ALIGNED_RANGE");
  assert.equal(result.value, null);
});

test("videoTimeToGameTime never bridges across a period boundary as if time flowed continuously", () => {
  // Anchors for period 1 end and period 2 start are NOT adjacent in real time (halftime elapses)
  // - a video time between them (if it existed) must not be treated as a continuation of period 1.
  const anchors = [
    anchor({ videoTimeMs: 0, period: 1, gameClockSeconds: 600 }),
    anchor({ videoTimeMs: 10000, period: 1, gameClockSeconds: 0 }),
    anchor({ videoTimeMs: 20000, period: 2, gameClockSeconds: 600 }),
    anchor({ videoTimeMs: 30000, period: 2, gameClockSeconds: 0 }),
  ];
  // 15000ms falls in the halftime gap - no segment covers it.
  const result = videoTimeToGameTime(15000, anchors);
  assert.equal(result.confidence, "OUTSIDE_ALIGNED_RANGE");
});

test("videoTimeToGameTime ignores unaccepted (pending-review) auto-detected anchors", () => {
  const anchors = [
    anchor({ videoTimeMs: 0, period: 1, gameClockSeconds: 600 }),
    anchor({ videoTimeMs: 10000, period: 1, gameClockSeconds: 590, accepted: false }), // e.g. AUTO_DETECTED, pending review
  ];
  const result = videoTimeToGameTime(10000, anchors);
  // Only one accepted anchor exists, so 10000ms cannot be resolved via interpolation/exact match.
  assert.equal(result.confidence, "OUTSIDE_ALIGNED_RANGE");
});

test("gameTimeToVideoTime is the inverse of videoTimeToGameTime within a segment", () => {
  const anchors = [
    anchor({ videoTimeMs: 0, period: 1, gameClockSeconds: 600 }),
    anchor({ videoTimeMs: 10000, period: 1, gameClockSeconds: 590 }),
  ];
  const result = gameTimeToVideoTime({ period: 1, gameClockSeconds: 595 }, anchors);
  assert.equal(result.confidence, "INTERPOLATED");
  assert.equal(result.value, 5000);
});

test("gameTimeToVideoTime returns OUTSIDE_ALIGNED_RANGE for a period with no anchors", () => {
  const anchors = [anchor({ videoTimeMs: 0, period: 1, gameClockSeconds: 600 }), anchor({ videoTimeMs: 10000, period: 1, gameClockSeconds: 590 })];
  const result = gameTimeToVideoTime({ period: 2, gameClockSeconds: 300 }, anchors);
  assert.equal(result.confidence, "OUTSIDE_ALIGNED_RANGE");
});

test("detectAnchorDrift flags a segment where implied video duration and game-clock duration diverge sharply", () => {
  const anchors = [
    anchor({ videoTimeMs: 0, period: 1, gameClockSeconds: 600 }),
    // 60 real seconds of video for only 10 seconds of game clock - way outside plausible drift.
    anchor({ videoTimeMs: 60000, period: 1, gameClockSeconds: 590 }),
  ];
  const issues = detectAnchorDrift(anchors);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].period, 1);
});

test("detectAnchorDrift reports nothing for a clean, consistent segment", () => {
  const anchors = [anchor({ videoTimeMs: 0, period: 1, gameClockSeconds: 600 }), anchor({ videoTimeMs: 10000, period: 1, gameClockSeconds: 590 })];
  assert.deepEqual(detectAnchorDrift(anchors), []);
});
