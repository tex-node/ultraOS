import assert from "node:assert/strict";
import test from "node:test";
import { computeAlignmentWindow, withinWindow, candidatesInWindow } from "./canonical-event-alignment";
import type { TimelineAnchor } from "./video-timeline";

const anchors: TimelineAnchor[] = [
  { videoTimeMs: 0, period: 2, gameClockSeconds: 600, accepted: true },
  { videoTimeMs: 600000, period: 2, gameClockSeconds: 0, accepted: true },
];

test("computeAlignmentWindow maps a canonical event's game time to a video-time window with tolerance margins", () => {
  // Canonical: H2 04:22 (262 seconds elapsed) -> video 262000ms
  const window = computeAlignmentWindow(2, 600 - 262, anchors, 1500);
  assert.ok(window !== null);
  assert.equal(window!.centerVideoMs, 262000);
  assert.equal(window!.startVideoMs, 260500);
  assert.equal(window!.endVideoMs, 263500);
});

test("computeAlignmentWindow returns null when the timeline cannot resolve the event's period at all", () => {
  const window = computeAlignmentWindow(3, 300, anchors);
  assert.equal(window, null);
});

test("withinWindow correctly includes boundary values", () => {
  const window = { centerVideoMs: 1000, startVideoMs: 500, endVideoMs: 1500, confidence: "INTERPOLATED" as const };
  assert.equal(withinWindow(500, window), true);
  assert.equal(withinWindow(1500, window), true);
  assert.equal(withinWindow(499, window), false);
  assert.equal(withinWindow(1501, window), false);
});

test("candidatesInWindow filters to the window and sorts closest-to-center first (never a blind full-video scan)", () => {
  const window = { centerVideoMs: 1000, startVideoMs: 500, endVideoMs: 1500, confidence: "INTERPOLATED" as const };
  const observations = [
    { id: "far-outside", videoTimeMs: 50000 },
    { id: "close", videoTimeMs: 1050 },
    { id: "closer", videoTimeMs: 990 },
  ];
  const result = candidatesInWindow(observations, window);
  assert.deepEqual(result.map((o) => o.id), ["closer", "close"]);
});
