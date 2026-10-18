import type { FocusArea, PlayerDevelopmentPlan } from "./player-development";

// P15 C1 remainder (I2 first slice): the serialized form of a plan a coach adopted.
//
// Why a snapshot instead of a reference to the engine: the engine is a pure function of the season's
// box scores, so its output CHANGES as games are played. A coach who adopts "improve free-throw
// shooting, target 72%" must still see that same commitment next week even if the engine would now
// say something else. The snapshot is therefore frozen at adoption time and carries the engine
// version that produced it, so a future drift is visible rather than silent.
//
// What is stored vs deliberately dropped: the actionable parts (dimension, label, priority, target,
// current value, review window, drill ids/names/durations) and an evidence SUMMARY sufficient to
// restate why the focus area was chosen. The full Evidence and the drill bodies are dropped - they
// are large, and both remain available from the engine by dimension/drill id. That keeps a plan row
// small enough to render without re-running the engine.
export const COACHING_PLAN_SNAPSHOT_VERSION = "c1-1";

export type PlanSnapshotDrill = { id: string; name: string; durationMinutes: number };

export type PlanSnapshotFocusArea = {
  dimension: string;
  label: string;
  priority: number;
  metricKey: string;
  metricLabel: string;
  current: { value: number; label: string };
  target: { value: number; label: string; reviewWindowGames: number; statement: string };
  evidence: {
    baselineKind: "POSITION_PEERS" | "LEAGUE";
    baselineLabel: string;
    peerCount: number;
    percentile: number;
    sampleLabel: string;
    confidence: string;
    gate: string;
  };
  drills: PlanSnapshotDrill[];
};

export type CoachingPlanSnapshot = {
  version: string;
  playerId: string;
  seasonClubId: string;
  position: string | null;
  positionGroup: string;
  gamesPlayed: number;
  status: "OK" | "INSUFFICIENT_DATA";
  reviewWindowGames: number;
  focusAreas: PlanSnapshotFocusArea[];
  strengths: { dimension: string; label: string }[];
};

function serializeFocusArea(area: FocusArea): PlanSnapshotFocusArea {
  return {
    dimension: area.dimension,
    label: area.label,
    priority: area.priority,
    metricKey: area.target.metricKey,
    metricLabel: area.target.metric,
    current: { value: area.target.current, label: area.target.currentLabel },
    target: {
      value: area.target.target,
      label: area.target.targetLabel,
      reviewWindowGames: area.target.reviewWindowGames,
      statement: area.target.statement,
    },
    evidence: {
      baselineKind: area.evidence.baseline.kind,
      baselineLabel: area.evidence.baseline.label,
      peerCount: area.evidence.baseline.peerCount,
      percentile: area.evidence.percentile,
      sampleLabel: area.evidence.sample.label,
      confidence: area.evidence.confidence,
      gate: area.evidence.gate,
    },
    drills: area.drills.map((drill) => ({ id: drill.id, name: drill.name, durationMinutes: drill.durationMinutes })),
  };
}

export function buildCoachingPlanSnapshot(plan: PlayerDevelopmentPlan): CoachingPlanSnapshot {
  // The review window is a property of the plan as a whole; every focus area's own Target already
  // carries the same number (the engine derives both from the same config). Taking the max is the
  // honest summary if they ever diverge - never silently picking the first.
  const reviewWindowGames = plan.focusAreas.reduce((max, area) => Math.max(max, area.target.reviewWindowGames), 0);
  return {
    version: COACHING_PLAN_SNAPSHOT_VERSION,
    playerId: plan.playerId,
    seasonClubId: plan.seasonClubId,
    position: plan.position,
    positionGroup: plan.positionGroup,
    gamesPlayed: plan.gamesPlayed,
    status: plan.status,
    reviewWindowGames,
    focusAreas: plan.focusAreas.map(serializeFocusArea),
    strengths: plan.strengths.map((s) => ({ dimension: s.dimension, label: s.label })),
  };
}

// A plan is adoptable only when the engine actually had enough evidence to make recommendations.
// Adopting an INSUFFICIENT_DATA plan would record a commitment to nothing and leave the coach with
// an empty list - refuse it and say why instead.
export function isAdoptablePlan(plan: PlayerDevelopmentPlan | null | undefined): plan is PlayerDevelopmentPlan {
  return Boolean(plan && plan.status === "OK" && plan.focusAreas.length > 0);
}

// Narrow a stored JSON value back to the snapshot shape, defensively: the column is JSONB, so a
// hand-edited row or a future writer must not be able to crash the page that renders it.
export function parseCoachingPlanSnapshot(value: unknown): CoachingPlanSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CoachingPlanSnapshot>;
  if (typeof candidate.version !== "string" || !Array.isArray(candidate.focusAreas)) return null;
  const focusAreas = candidate.focusAreas.filter((area): area is PlanSnapshotFocusArea => {
    if (!area || typeof area !== "object") return false;
    const a = area as Partial<PlanSnapshotFocusArea>;
    return typeof a.dimension === "string" && typeof a.label === "string" && Boolean(a.target) && Array.isArray(a.drills);
  });
  return {
    version: candidate.version,
    playerId: String(candidate.playerId ?? ""),
    seasonClubId: String(candidate.seasonClubId ?? ""),
    position: candidate.position ?? null,
    positionGroup: String(candidate.positionGroup ?? "UNKNOWN"),
    gamesPlayed: Number(candidate.gamesPlayed ?? 0),
    status: candidate.status === "OK" ? "OK" : "INSUFFICIENT_DATA",
    reviewWindowGames: Number(candidate.reviewWindowGames ?? 0),
    focusAreas,
    strengths: Array.isArray(candidate.strengths) ? candidate.strengths : [],
  };
}
