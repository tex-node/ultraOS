// Canonical Event Alignment (G.21, Part XXIV). Pure - maps a canonical GameEvent's game-clock
// position to a video-time WINDOW (not a blind full-video search - Part XXIV's own instruction:
// "Do not search the whole video blindly for a known event"), then narrows real observations to
// that window. The actual DB query (find observations within the window) lives in the loader;
// this module only computes the window and filters an already-fetched observation list, so the
// windowing logic itself is unit-testable without a database.
import { gameTimeToVideoTime, type TimelineAnchor, type TimelineConfidence } from "./video-timeline";
import { DEFAULT_TEMPORAL_TOLERANCE_MS } from "./vision-match-confidence";

export type AlignmentWindow = {
  centerVideoMs: number;
  startVideoMs: number;
  endVideoMs: number;
  confidence: TimelineConfidence;
};

export function computeAlignmentWindow(
  period: number,
  gameClockSeconds: number,
  anchors: TimelineAnchor[],
  toleranceMs: number = DEFAULT_TEMPORAL_TOLERANCE_MS,
): AlignmentWindow | null {
  const mapped = gameTimeToVideoTime({ period, gameClockSeconds }, anchors);
  if (mapped.value === null) return null;
  return {
    centerVideoMs: mapped.value,
    startVideoMs: mapped.value - toleranceMs,
    endVideoMs: mapped.value + toleranceMs,
    confidence: mapped.confidence,
  };
}

export function withinWindow(videoTimeMs: number, window: AlignmentWindow): boolean {
  return videoTimeMs >= window.startVideoMs && videoTimeMs <= window.endVideoMs;
}

export type ObservationTimeRef = { id: string; videoTimeMs: number };

// Filters an already-fetched candidate list (never the whole video's observations) down to the
// ones inside the aligned window, closest-first.
export function candidatesInWindow<T extends ObservationTimeRef>(observations: T[], window: AlignmentWindow): T[] {
  return observations
    .filter((o) => withinWindow(o.videoTimeMs, window))
    .sort((a, b) => Math.abs(a.videoTimeMs - window.centerVideoMs) - Math.abs(b.videoTimeMs - window.centerVideoMs));
}
