// System Health Model (G.20, Part V-IX). Pure functions only - no Prisma, no fetch. Every
// function here takes already-gathered plain data and returns a judgement; the one file allowed
// to gather that data is system-health-loader.ts, mirroring the "one Prisma-touching composition
// point" convention live-game-snapshot-v2.ts already established. This keeps the actual health
// *logic* unit-testable without a database or a live server.
//
// "Do not derive one generic green from HTTP 200 alone" (Part V) - every component here is a
// real judgement about a real signal (an age, a score difference, a structural validity check),
// never just "the request didn't throw."
export type HealthStatus = "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
export type Freshness = "FRESH" | "DELAYED" | "STALE" | "NOT_APPLICABLE";

export type ComponentHealth = { status: HealthStatus; label: string; detail: string };

// Thresholds (Part VI: "document the thresholds, consider current polling cadence"). The public
// /live page polls every 8s (LiveRefresher) and every browser-source graphic polls every 3-5s
// (GraphicRefresher) - see live-refresher.tsx / graphic-refresher.tsx. A FRESH snapshot should
// comfortably outlast the slowest of those polling intervals; DELAYED gives real operators margin
// for a genuinely quiet defensive stretch before escalating to STALE. These are the only two
// polling cadences that exist in this codebase today, so they're the only real inputs available
// to calibrate against - not arbitrary round numbers.
export const FRESHNESS_THRESHOLDS = {
  snapshotFreshSeconds: 30,
  snapshotDelayedSeconds: 120,
  presentationFreshSeconds: 600, // Program legitimately changes rarely - see computePresentationHealth
} as const;

export function computeFreshness(ageSeconds: number, freshSeconds: number, delayedSeconds: number): Freshness {
  if (ageSeconds <= freshSeconds) return "FRESH";
  if (ageSeconds <= delayedSeconds) return "DELAYED";
  return "STALE";
}

// Part VII: "Do NOT infer outage solely because no scoring event occurred... use actual signals."
// Snapshot freshness only applies while the game is actually expected to be producing updates -
// LIVE with the clock running. A PAUSED game, a NOT_STARTED game, or a FINAL game correctly
// report NOT_APPLICABLE rather than a false STALE alarm.
export function computeSnapshotHealth(input: {
  gameStatus: string;
  clockRunning: boolean;
  lastEventAt: Date | null;
  nowMs: number;
}): ComponentHealth & { freshness: Freshness; ageSeconds: number | null } {
  const expectingActivity = input.gameStatus === "LIVE" && input.clockRunning;
  if (!expectingActivity) {
    return { status: "HEALTHY", label: "Snapshot V2", detail: "No live activity currently expected.", freshness: "NOT_APPLICABLE", ageSeconds: null };
  }
  if (!input.lastEventAt) {
    return { status: "WARNING", label: "Snapshot V2", detail: "Game is LIVE with the clock running, but no event has ever been recorded.", freshness: "STALE", ageSeconds: null };
  }
  const ageSeconds = Math.floor((input.nowMs - input.lastEventAt.getTime()) / 1000);
  const freshness = computeFreshness(ageSeconds, FRESHNESS_THRESHOLDS.snapshotFreshSeconds, FRESHNESS_THRESHOLDS.snapshotDelayedSeconds);
  if (freshness === "FRESH") return { status: "HEALTHY", label: "Snapshot V2", detail: `Last event ${ageSeconds}s ago.`, freshness, ageSeconds };
  if (freshness === "DELAYED") return { status: "WARNING", label: "Snapshot V2", detail: `No new event in ${ageSeconds}s while the clock is running.`, freshness, ageSeconds };
  return { status: "CRITICAL", label: "Snapshot V2", detail: `No new event in ${ageSeconds}s while the clock is running.`, freshness, ageSeconds };
}

// Part VIII. Never auto-reconciled - this only ever surfaces the disagreement, exactly per the
// track's own safety rule ("if monitoring discovers a mismatch: surface it, do not silently
// correct it").
export function computeReconciliationHealth(input: {
  overallStatus: "MATCHED" | "MISMATCH" | "UNAVAILABLE";
  isFinal: boolean;
}): ComponentHealth {
  if (input.overallStatus === "UNAVAILABLE") {
    return { status: "UNKNOWN", label: "Score Reconciliation", detail: "No statistician events recorded yet - nothing to reconcile against." };
  }
  if (input.overallStatus === "MATCHED") {
    return { status: "HEALTHY", label: "Score Reconciliation", detail: "Official and statistical scores agree." };
  }
  // MISMATCH: WARNING while live (may resolve as the statistician catches up), CRITICAL once
  // FINAL (Part VIII: "unresolved mismatch should be more severe" once the game has ended).
  return input.isFinal
    ? { status: "CRITICAL", label: "Score Reconciliation", detail: "Official and statistical scores disagree on a FINAL game - unresolved." }
    : { status: "WARNING", label: "Score Reconciliation", detail: "Official and statistical scores currently disagree." };
}

// Part IX: detect impossible/invalid Program state without crashing a browser source. The loader
// passes in whether it could actually resolve the referenced fixture/game and whether that
// fixture is production-scoped; this function only judges the result.
export function computePresentationHealth(input: {
  hasProgram: boolean;
  programFixtureExists: boolean;
  programFixtureIsProduction: boolean;
  programAgeSeconds: number | null;
}): ComponentHealth & { freshness: Freshness } {
  if (!input.hasProgram) {
    return { status: "HEALTHY", label: "Presentation (Program)", detail: "Program is empty.", freshness: "NOT_APPLICABLE" };
  }
  if (!input.programFixtureExists) {
    return { status: "CRITICAL", label: "Presentation (Program)", detail: "Program references a fixture/game that no longer exists.", freshness: "NOT_APPLICABLE" };
  }
  if (!input.programFixtureIsProduction) {
    return { status: "CRITICAL", label: "Presentation (Program)", detail: "Program references a non-PRODUCTION fixture while in normal operation.", freshness: "NOT_APPLICABLE" };
  }
  const ageSeconds = input.programAgeSeconds ?? 0;
  // Program legitimately sits unchanged for long stretches (an operator TAKEs a score bug once
  // and leaves it up all game) - a long age is not itself unhealthy, only reported for context.
  const freshness = computeFreshness(ageSeconds, FRESHNESS_THRESHOLDS.presentationFreshSeconds, FRESHNESS_THRESHOLDS.presentationFreshSeconds * 4);
  return { status: "HEALTHY", label: "Presentation (Program)", detail: `Program set ${ageSeconds}s ago.`, freshness };
}

export function combineStatuses(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("CRITICAL")) return "CRITICAL";
  if (statuses.includes("WARNING")) return "WARNING";
  if (statuses.every((s) => s === "UNKNOWN")) return statuses.length > 0 ? "UNKNOWN" : "HEALTHY";
  return "HEALTHY";
}
