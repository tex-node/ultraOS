// Match Confidence (G.21, Part XXV-XXVI). A deterministic MATCH SCORE, never presented as
// opaque "AI confidence" - every point is explainable. Weighting is documented here, not
// hidden, so a human reviewer (or a future model developer) can see exactly why a candidate
// scored what it did.
import type { VisionMatchBand } from "@/generated/prisma/enums";

export type MatchEvidence = {
  temporalErrorMs: number | null;
  teamMatch: boolean | null;
  playerMatch: boolean | null;
  eventTypeMatch: boolean | null;
  shotResultMatch: boolean | null;
};

export type MatchScoreResult = { score: number; band: VisionMatchBand; evidence: MatchEvidence };

// Documented weighting (Part XXVI: "document weighting"). Each factor contributes independently;
// an unknown/unavailable factor (null) contributes nothing rather than being treated as a match
// or a mismatch - absence of evidence is not evidence of absence.
const WEIGHTS = {
  temporalProximity: 0.35, // full credit inside the tolerance window, decaying to 0 at 2x tolerance
  teamMatch: 0.2,
  playerMatch: 0.25,
  eventTypeMatch: 0.15,
  shotResultMatch: 0.05,
} as const;

// Default alignment tolerance - how far apart (in video-time terms, translated to game-clock
// terms via the timeline mapping) a vision candidate and a canonical event can be and still be
// considered "at the same moment." Calibrated conservatively pending real timeline-accuracy data
// from an actual analyzed game (none exists yet - see the final report's "empirical rehearsal"
// section).
export const DEFAULT_TEMPORAL_TOLERANCE_MS = 1500;

function temporalProximityScore(temporalErrorMs: number | null, toleranceMs: number): number {
  if (temporalErrorMs === null) return 0;
  const abs = Math.abs(temporalErrorMs);
  if (abs <= toleranceMs) return WEIGHTS.temporalProximity;
  if (abs >= toleranceMs * 2) return 0;
  const decay = 1 - (abs - toleranceMs) / toleranceMs;
  return WEIGHTS.temporalProximity * decay;
}

function boolScore(value: boolean | null, weight: number): number {
  if (value === null) return 0;
  return value ? weight : -weight; // an explicit mismatch actively penalizes, not just withholds credit
}

export function scoreMatch(evidence: MatchEvidence, toleranceMs: number = DEFAULT_TEMPORAL_TOLERANCE_MS): MatchScoreResult {
  const raw =
    temporalProximityScore(evidence.temporalErrorMs, toleranceMs) +
    boolScore(evidence.teamMatch, WEIGHTS.teamMatch) +
    boolScore(evidence.playerMatch, WEIGHTS.playerMatch) +
    boolScore(evidence.eventTypeMatch, WEIGHTS.eventTypeMatch) +
    boolScore(evidence.shotResultMatch, WEIGHTS.shotResultMatch);
  const score = Math.max(0, Math.min(1, raw));

  let band: VisionMatchBand;
  if (evidence.teamMatch === false || evidence.eventTypeMatch === false) {
    // A confirmed team or event-type mismatch is disqualifying regardless of temporal proximity
    // - a candidate cannot be a "possible match" for an event it structurally cannot be.
    band = "NO_MATCH";
  } else if (score >= 0.75) {
    band = "STRONG_MATCH";
  } else if (score >= 0.4) {
    band = "POSSIBLE_MATCH";
  } else if (score > 0) {
    band = "AMBIGUOUS";
  } else {
    band = "NO_MATCH";
  }

  return { score, band, evidence };
}
