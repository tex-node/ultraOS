// A4 (offline scoring tap): validates a client-asserted shot resolution at replay time. The server
// does not (cannot) re-derive Ultra Time/multiplier for an offline-queued tap - see
// docs/canonical-write-audit.md's "wall-clock-derived event fields" note - so its job shifts from
// resolving to validating: reject a structurally implausible or inconsistent assertion, accept
// anything well-formed. This is intentionally NOT a re-derivation of scoreShot's own result -
// re-implementing "was Ultra Time actually active at that exact clock second" here would just be
// the same wrong idea (the server guessing at a wall-clock fact it didn't observe) wearing a
// different name.
import type { RuleSnapshotForScoring } from "../ultra-scoring-engine";

export interface ClientShotAssertion {
  basePointValue: number;
  multiplier: number;
  points: number;
  isUltraTime: boolean;
}

export type ClientShotValidationError =
  | "INVALID_BASE_POINT_VALUE"
  | "FOUR_POINT_DISABLED"
  | "INVALID_MULTIPLIER"
  | "ULTRA_TIME_MULTIPLIER_MISMATCH"
  | "ULTRA_TIME_DISABLED"
  | "POINTS_MISMATCH";

export type ClientShotValidationResult = { valid: true } | { valid: false; error: ClientShotValidationError };

// Structural/consistency checks only - the four things a client-asserted shot must satisfy
// regardless of what the actual wall-clock state was: a legal shot value under these rules, a
// multiplier that's actually one of the two values these rules can ever produce, isUltraTime
// agreeing with which of those two the multiplier is, and the arithmetic being self-consistent.
export function validateClientResolvedShot(
  assertion: ClientShotAssertion,
  rules: RuleSnapshotForScoring,
): ClientShotValidationResult {
  if (!Number.isInteger(assertion.basePointValue) || assertion.basePointValue < 1 || assertion.basePointValue > 4) {
    return { valid: false, error: "INVALID_BASE_POINT_VALUE" };
  }
  if (assertion.basePointValue === 4 && !rules.fourPointEnabled) {
    return { valid: false, error: "FOUR_POINT_DISABLED" };
  }
  if (assertion.multiplier !== 1 && assertion.multiplier !== rules.ultraTimeMultiplier) {
    return { valid: false, error: "INVALID_MULTIPLIER" };
  }
  const multiplierClaimsUltraTime = assertion.multiplier !== 1;
  if (assertion.isUltraTime !== multiplierClaimsUltraTime) {
    return { valid: false, error: "ULTRA_TIME_MULTIPLIER_MISMATCH" };
  }
  if (assertion.isUltraTime && !rules.ultraTimeEnabled) {
    return { valid: false, error: "ULTRA_TIME_DISABLED" };
  }
  if (assertion.points !== assertion.basePointValue * assertion.multiplier) {
    return { valid: false, error: "POINTS_MISMATCH" };
  }
  return { valid: true };
}

// Generous on both sides, deliberately: a genuine offline gap for a scorekeeper's tablet is
// expected to be minutes, not days, but Season Zero's occasional-drops reality could plausibly
// stretch to hours before a device regains connectivity and drains. The bound exists to catch
// garbage/stale values (a clock reset to the epoch, a stuck client resending an ancient record),
// not to police exactly how long "too long offline" is.
export const CLIENT_OBSERVATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CLIENT_OBSERVATION_MAX_SKEW_MS = 5 * 60 * 1000;

export function isClientObservedAtPlausible(clientObservedAt: string, now: number = Date.now()): boolean {
  const observed = new Date(clientObservedAt).getTime();
  if (Number.isNaN(observed)) return false;
  if (observed > now + CLIENT_OBSERVATION_MAX_SKEW_MS) return false;
  if (observed < now - CLIENT_OBSERVATION_MAX_AGE_MS) return false;
  return true;
}
