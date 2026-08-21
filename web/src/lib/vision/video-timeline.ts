// Video Timeline Model (G.21, Part VII-X). Pure functions only - no Prisma. Video time and game
// clock are NOT the same thing; this module is the one place that translates between them, built
// entirely from operator-placed anchors (Part VIII: "Build manual synchronization first").
//
// Anchors are individual points (videoTimeMs <-> period/gameClockSeconds). This module derives
// piecewise segments from them at read time (Part IX's recommendation) rather than persisting
// segments as their own entity - a segment is fully determined by two consecutive accepted
// anchors within the same period, so storing it separately would just be a second copy that
// could drift from the anchors it was derived from.
export type TimelineAnchor = {
  videoTimeMs: number;
  period: number;
  gameClockSeconds: number;
  accepted: boolean;
};

export type GameTimePoint = { period: number; gameClockSeconds: number };

// Part X: never pretend an interpolated timestamp is exact.
export type TimelineConfidence = "EXACT_ANCHOR" | "INTERPOLATED" | "LOW_CONFIDENCE" | "OUTSIDE_ALIGNED_RANGE" | "UNAVAILABLE";

export type TimelineMappingResult<T> = { value: T | null; confidence: TimelineConfidence };

type Segment = {
  videoStartMs: number;
  videoEndMs: number;
  period: number;
  gameClockStart: number;
  gameClockEnd: number;
};

// Only accepted anchors ever participate in mapping - an AUTO_DETECTED anchor pending review
// (accepted: false) must never silently affect real synchronization (Part XI).
function usableAnchors(anchors: TimelineAnchor[]): TimelineAnchor[] {
  return anchors.filter((a) => a.accepted).sort((a, b) => a.videoTimeMs - b.videoTimeMs);
}

// A segment only forms between two consecutive anchors in the SAME period - a period boundary
// (halftime, end of a half) is never assumed to progress linearly, since real time elapses
// during the stoppage that the game clock does not reflect (Part VII/IX: "do not assume video
// second 0 = game clock start" / "do not assume constant time progression through stoppages").
function buildSegments(anchors: TimelineAnchor[]): Segment[] {
  const ordered = usableAnchors(anchors);
  const segments: Segment[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    if (a.period !== b.period) continue;
    segments.push({ videoStartMs: a.videoTimeMs, videoEndMs: b.videoTimeMs, period: a.period, gameClockStart: a.gameClockSeconds, gameClockEnd: b.gameClockSeconds });
  }
  return segments;
}

export function videoTimeToGameTime(videoMs: number, anchors: TimelineAnchor[]): TimelineMappingResult<GameTimePoint> {
  const ordered = usableAnchors(anchors);
  if (ordered.length === 0) return { value: null, confidence: "UNAVAILABLE" };

  const exact = ordered.find((a) => a.videoTimeMs === videoMs);
  if (exact) return { value: { period: exact.period, gameClockSeconds: exact.gameClockSeconds }, confidence: "EXACT_ANCHOR" };

  const segments = buildSegments(ordered);
  for (const segment of segments) {
    if (videoMs < segment.videoStartMs || videoMs > segment.videoEndMs) continue;
    const span = segment.videoEndMs - segment.videoStartMs;
    // A zero-length or negative span is a malformed pair of anchors (duplicate videoTimeMs) -
    // report LOW_CONFIDENCE rather than dividing by zero or fabricating a value.
    if (span <= 0) return { value: { period: segment.period, gameClockSeconds: segment.gameClockStart }, confidence: "LOW_CONFIDENCE" };
    const fraction = (videoMs - segment.videoStartMs) / span;
    // Game clock counts DOWN as video time increases within a running segment.
    const gameClockSeconds = segment.gameClockStart - fraction * (segment.gameClockStart - segment.gameClockEnd);
    return { value: { period: segment.period, gameClockSeconds }, confidence: "INTERPOLATED" };
  }

  return { value: null, confidence: "OUTSIDE_ALIGNED_RANGE" };
}

export function gameTimeToVideoTime(point: GameTimePoint, anchors: TimelineAnchor[]): TimelineMappingResult<number> {
  const ordered = usableAnchors(anchors);
  if (ordered.length === 0) return { value: null, confidence: "UNAVAILABLE" };

  const exact = ordered.find((a) => a.period === point.period && a.gameClockSeconds === point.gameClockSeconds);
  if (exact) return { value: exact.videoTimeMs, confidence: "EXACT_ANCHOR" };

  const segments = buildSegments(ordered).filter((s) => s.period === point.period);
  for (const segment of segments) {
    const [hi, lo] = segment.gameClockStart >= segment.gameClockEnd ? [segment.gameClockStart, segment.gameClockEnd] : [segment.gameClockEnd, segment.gameClockStart];
    if (point.gameClockSeconds > hi || point.gameClockSeconds < lo) continue;
    const clockSpan = segment.gameClockStart - segment.gameClockEnd;
    if (clockSpan === 0) return { value: segment.videoStartMs, confidence: "LOW_CONFIDENCE" };
    const fraction = (segment.gameClockStart - point.gameClockSeconds) / clockSpan;
    const videoMs = segment.videoStartMs + fraction * (segment.videoEndMs - segment.videoStartMs);
    return { value: videoMs, confidence: "INTERPOLATED" };
  }

  return { value: null, confidence: "OUTSIDE_ALIGNED_RANGE" };
}

// Part X: drift detection. Two anchors close together in game-clock terms but far apart in
// implied real-time video duration (or vice versa) suggest the anchors themselves are wrong
// (misread game clock, wrong period) rather than genuine timeline behavior.
export function detectAnchorDrift(anchors: TimelineAnchor[], toleranceSecondsPerMinute = 5): { periodBoundaryDriftSeconds: number; period: number }[] {
  const segments = buildSegments(usableAnchors(anchors));
  const issues: { periodBoundaryDriftSeconds: number; period: number }[] = [];
  for (const segment of segments) {
    const impliedVideoSeconds = (segment.videoEndMs - segment.videoStartMs) / 1000;
    const impliedClockSeconds = segment.gameClockStart - segment.gameClockEnd;
    if (impliedClockSeconds <= 0) continue;
    const driftPerMinute = Math.abs(impliedVideoSeconds - impliedClockSeconds) / (impliedClockSeconds / 60);
    if (driftPerMinute > toleranceSecondsPerMinute) {
      issues.push({ period: segment.period, periodBoundaryDriftSeconds: Math.round(impliedVideoSeconds - impliedClockSeconds) });
    }
  }
  return issues;
}
