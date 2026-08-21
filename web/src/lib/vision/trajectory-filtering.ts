// Trajectory Filtering (G.22, Part XXXIII-XXXV). Pure. Raw court-coordinate samples are noisy -
// this module produces a filtered representation, always preserving the raw input separately
// (never overwriting it), and documents its own parameters rather than hiding them.
export type RawSample = { videoTimeMs: number; courtX: number; courtY: number };
export type FilteredSample = RawSample & { rejected: boolean; rejectReason: "IMPOSSIBLE_JUMP" | null };

// A player covering more than this many units/second between consecutive samples is treated as
// a tracking/calibration artifact, not a real movement (Part XXXV: "if a player appears to run
// 80 km/h, your tracker/calibration is wrong. Flag rather than display."). 12 m/s (~43 km/h) is
// already far beyond any human sprint speed - chosen as a generous upper bound specifically so a
// real fast break is never mistaken for an error, while a genuine tracking glitch (a jersey-color
// swap teleporting a track across the court) still gets caught.
export const MAX_PLAUSIBLE_SPEED_UNITS_PER_SECOND = 12;

// Reject samples whose implied speed since the last ACCEPTED sample exceeds the plausible
// maximum - rejected samples are flagged, never silently dropped, so a caller can still see gap
// structure and quality.
export function rejectImpossibleJumps(samples: RawSample[], maxSpeed = MAX_PLAUSIBLE_SPEED_UNITS_PER_SECOND): FilteredSample[] {
  const sorted = [...samples].sort((a, b) => a.videoTimeMs - b.videoTimeMs);
  const result: FilteredSample[] = [];
  let lastAccepted: RawSample | null = null;
  for (const sample of sorted) {
    if (!lastAccepted) {
      result.push({ ...sample, rejected: false, rejectReason: null });
      lastAccepted = sample;
      continue;
    }
    const dtSeconds = (sample.videoTimeMs - lastAccepted.videoTimeMs) / 1000;
    if (dtSeconds <= 0) {
      result.push({ ...sample, rejected: true, rejectReason: "IMPOSSIBLE_JUMP" });
      continue;
    }
    const distance = Math.hypot(sample.courtX - lastAccepted.courtX, sample.courtY - lastAccepted.courtY);
    const impliedSpeed = distance / dtSeconds;
    if (impliedSpeed > maxSpeed) {
      result.push({ ...sample, rejected: true, rejectReason: "IMPOSSIBLE_JUMP" });
      continue;
    }
    result.push({ ...sample, rejected: false, rejectReason: null });
    lastAccepted = sample;
  }
  return result;
}

// Moving-median smoothing over a window of ACCEPTED samples (chosen over a moving average or a
// Kalman filter for this first pass specifically because a median is robust to the exact kind of
// single-sample spikes a detector/tracker produces, and needs no tuned process/measurement noise
// model the way a Kalman filter would - a reasonable, honestly-simpler starting point, not
// claimed optimal). windowSize must be odd so the window has a true center sample.
export function movingMedianSmooth(samples: RawSample[], windowSize = 5): RawSample[] {
  if (windowSize % 2 === 0) throw new Error("windowSize must be odd for a moving median.");
  const sorted = [...samples].sort((a, b) => a.videoTimeMs - b.videoTimeMs);
  const half = Math.floor(windowSize / 2);
  return sorted.map((sample, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(sorted.length, i + half + 1);
    const window = sorted.slice(start, end);
    const median = (values: number[]) => {
      const s = [...values].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
    };
    return { videoTimeMs: sample.videoTimeMs, courtX: median(window.map((w) => w.courtX)), courtY: median(window.map((w) => w.courtY)) };
  });
}

// The full pipeline: reject impossible jumps first (on raw data, where a spike is most obvious),
// then smooth only the accepted samples - smoothing before rejection would let one bad sample
// contaminate its neighbors' medians.
export function filterTrajectory(samples: RawSample[], windowSize = 5, maxSpeed = MAX_PLAUSIBLE_SPEED_UNITS_PER_SECOND): { filtered: RawSample[]; rejectedCount: number } {
  const withRejections = rejectImpossibleJumps(samples, maxSpeed);
  const accepted = withRejections.filter((s) => !s.rejected);
  const smoothed = movingMedianSmooth(accepted, windowSize);
  return { filtered: smoothed, rejectedCount: withRejections.length - accepted.length };
}
