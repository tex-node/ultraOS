// Vision domain composition layer (G.21). The Prisma-touching counterpart to the pure modules in
// this directory - mirrors the "one composition point per concern" convention established by
// live-game-snapshot-v2.ts and system-health-loader.ts. Every write here is either additive
// (registering video, creating an anchor/run/observation) or a reviewer-attributed status change
// with an AuditLog entry - never a write to Fixture/Game/GameEvent/PlayerStat/TeamStat/Standing.
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import type { VideoSourceType, VisionObservationType, VisionObservationStatus, VisionAnalysisRunStatus } from "@/generated/prisma/enums";
import { deriveLineup, type LineupEntry, type SubstitutionRecord } from "@/lib/lineup";
import type { RosterPlayer } from "./player-identity-constraints";
import { computeAlignmentWindow, candidatesInWindow } from "./canonical-event-alignment";
import { scoreMatch, type MatchEvidence } from "./vision-match-confidence";
import type { TimelineAnchor } from "./video-timeline";

export async function registerGameVideoFromExistingAsset(input: {
  fixtureId: string;
  gameId: string | null;
  mediaAssetId: string;
  sourceType: VideoSourceType;
  cameraLabel: string | null;
  recordingStartedAt: Date | null;
  registeredById: string;
}) {
  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: input.mediaAssetId } });
  if (!asset.mimeType.startsWith("video/")) {
    throw new Error(`MediaAsset ${input.mediaAssetId} has mimeType "${asset.mimeType}", not a video/* type.`);
  }
  const fixture = await prisma.fixture.findUniqueOrThrow({ where: { id: input.fixtureId } });

  return prisma.$transaction(async (tx) => {
    const video = await tx.gameVideo.create({
      data: {
        fixtureId: fixture.id,
        gameId: input.gameId,
        mediaAssetId: asset.id,
        sourceType: input.sourceType,
        cameraLabel: input.cameraLabel,
        recordingStartedAt: input.recordingStartedAt,
        registeredById: input.registeredById,
      },
    });
    await tx.mediaAsset.update({ where: { id: asset.id }, data: { purpose: "GAME_VIDEO" } });
    await writeAuditLog(tx, {
      userId: input.registeredById, action: "GAME_VIDEO_REGISTERED", entityType: "GameVideo", entityId: video.id,
      details: { fixtureId: fixture.id, mediaAssetId: asset.id, sourceType: input.sourceType },
    });
    return video;
  });
}

export async function listGameVideosForFixture(fixtureId: string) {
  return prisma.gameVideo.findMany({
    where: { fixtureId },
    include: { mediaAsset: true, anchors: true, analysisRuns: { include: { visionModel: true } }, _count: { select: { observations: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createTimelineAnchor(input: {
  gameVideoId: string; videoTimeMs: number; period: number; gameClockSeconds: number;
  source: "MANUAL" | "AUTO_DETECTED"; confidence: number | null; createdById: string;
}) {
  return prisma.$transaction(async (tx) => {
    const anchor = await tx.videoTimelineAnchor.create({
      data: {
        gameVideoId: input.gameVideoId, videoTimeMs: input.videoTimeMs, period: input.period, gameClockSeconds: input.gameClockSeconds,
        source: input.source, confidence: input.confidence, accepted: input.source === "MANUAL", createdById: input.createdById,
      },
    });
    await writeAuditLog(tx, {
      userId: input.createdById, action: "VIDEO_TIMELINE_ANCHOR_CREATED", entityType: "VideoTimelineAnchor", entityId: anchor.id,
      details: { gameVideoId: input.gameVideoId, videoTimeMs: input.videoTimeMs, period: input.period, gameClockSeconds: input.gameClockSeconds, source: input.source },
    });
    return anchor;
  });
}

// Part XI: the ONLY way an AUTO_DETECTED anchor becomes usable for real synchronization.
export async function acceptTimelineAnchor(anchorId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const anchor = await tx.videoTimelineAnchor.update({ where: { id: anchorId }, data: { accepted: true } });
    await writeAuditLog(tx, { userId: actorId, action: "VIDEO_TIMELINE_ANCHOR_ACCEPTED", entityType: "VideoTimelineAnchor", entityId: anchorId, details: {} });
    return anchor;
  });
}

export async function getAnchorsForVideo(gameVideoId: string): Promise<TimelineAnchor[]> {
  const rows = await prisma.videoTimelineAnchor.findMany({ where: { gameVideoId }, orderBy: { videoTimeMs: "asc" } });
  return rows.map((a) => ({ videoTimeMs: a.videoTimeMs, period: a.period, gameClockSeconds: a.gameClockSeconds, accepted: a.accepted }));
}

// Reuses G.17's lineup reconstruction (deriveLineup) - never a second lineup engine. Returns the
// full roster (for identity candidates when no lineup constraint applies) plus, when clockSeconds
// is given, which of those players were actually on court at that moment.
export async function buildGameRoster(gameId: string): Promise<{ roster: RosterPlayer[]; starters: LineupEntry[]; substitutions: SubstitutionRecord[] }> {
  const [starters, subRows] = await Promise.all([
    prisma.gameStarter.findMany({ where: { gameId }, select: { seasonClubId: true, playerId: true, player: { select: { jerseyNumber: true } } } }),
    prisma.gameEvent.findMany({
      where: { gameId, eventType: "SUBSTITUTION", status: "ACTIVE" },
      orderBy: { sequenceNumber: "asc" },
      select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true },
    }),
  ]);
  const substitutions: SubstitutionRecord[] = subRows
    .filter((s): s is typeof s & { seasonClubId: string; playerId: string; substitutedOutPlayerId: string; sequenceNumber: number } =>
      Boolean(s.seasonClubId && s.playerId && s.substitutedOutPlayerId && s.sequenceNumber !== null))
    .map((s) => ({ seasonClubId: s.seasonClubId, playerInId: s.playerId, playerOutId: s.substitutedOutPlayerId, sequenceNumber: s.sequenceNumber }));

  const allInvolvedPlayerIds = new Set<string>([...starters.map((s) => s.playerId), ...substitutions.map((s) => s.playerInId)]);
  const players = await prisma.player.findMany({ where: { id: { in: [...allInvolvedPlayerIds] } }, select: { id: true, seasonClubId: true, jerseyNumber: true } });
  const roster: RosterPlayer[] = players.map((p) => ({ playerId: p.id, seasonClubId: p.seasonClubId ?? "", jerseyNumber: p.jerseyNumber }));

  return { roster, starters: starters.map((s) => ({ seasonClubId: s.seasonClubId, playerId: s.playerId })), substitutions };
}

export function currentLineupPlayerIds(starters: LineupEntry[], substitutions: SubstitutionRecord[], upToSequence: number): string[] {
  const lineup = deriveLineup(starters, substitutions.filter((s) => s.sequenceNumber <= upToSequence));
  return [...lineup.values()].flatMap((set) => [...set]);
}

export async function ensureVisionModel(key: string, version: string, description?: string) {
  return prisma.visionModel.upsert({
    where: { key }, create: { key, version, description }, update: { version, description },
  });
}

export async function createAnalysisRun(input: { gameVideoId: string; visionModelId: string; requestedById: string; configHash?: string }) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.visionAnalysisRun.create({
      data: { gameVideoId: input.gameVideoId, visionModelId: input.visionModelId, requestedById: input.requestedById, configHash: input.configHash },
    });
    await writeAuditLog(tx, { userId: input.requestedById, action: "VISION_ANALYSIS_RUN_CREATED", entityType: "VisionAnalysisRun", entityId: run.id, details: { gameVideoId: input.gameVideoId } });
    return run;
  });
}

export async function setAnalysisRunStatus(runId: string, status: VisionAnalysisRunStatus, patch: { startedAt?: Date; completedAt?: Date; errorMessage?: string; observationCount?: number } = {}) {
  return prisma.visionAnalysisRun.update({ where: { id: runId }, data: { status, ...patch } });
}

export async function recordObservation(input: {
  analysisRunId: string; gameVideoId: string; videoTimeMs: number; videoTimeEndMs?: number;
  observationType: VisionObservationType; boundingBox?: object; confidence: number;
  trackId?: string; teamCandidateSeasonClubId?: string; playerCandidatePlayerId?: string; jerseyCandidateNumber?: number;
  eventCandidateType?: string; courtX?: number; courtY?: number; rawMetadata?: object;
}) {
  return prisma.visionObservation.create({ data: { ...input, boundingBox: input.boundingBox ?? undefined, rawMetadata: input.rawMetadata ?? undefined } });
}

// Canonical Event Alignment (Part XXIV) - given a canonical GameEvent, find candidate
// observations within its aligned video-time window and score them. Read-only; does not persist
// a VisionEventMatch (that's a separate, explicit action - see persistEventMatchCandidates).
export async function findAlignmentCandidates(gameVideoId: string, canonicalEvent: { id: string; period: number; clockSeconds: number; seasonClubId: string | null; playerId: string | null; eventType: string; made: boolean | null }) {
  const anchors = await getAnchorsForVideo(gameVideoId);
  const window = computeAlignmentWindow(canonicalEvent.period, canonicalEvent.clockSeconds, anchors);
  if (!window) return { window: null, candidates: [] as { observationId: string; evidence: MatchEvidence; result: ReturnType<typeof scoreMatch> }[] };

  const observations = await prisma.visionObservation.findMany({
    where: { gameVideoId, videoTimeMs: { gte: window.startVideoMs, lte: window.endVideoMs } },
    select: { id: true, videoTimeMs: true, teamCandidateSeasonClubId: true, playerCandidatePlayerId: true, eventCandidateType: true, observationType: true },
  });
  const nearby = candidatesInWindow(observations.map((o) => ({ ...o, id: o.id })), window);

  return {
    window,
    candidates: nearby.map((o) => {
      const evidence: MatchEvidence = {
        temporalErrorMs: o.videoTimeMs - window.centerVideoMs,
        teamMatch: canonicalEvent.seasonClubId === null || o.teamCandidateSeasonClubId === null ? null : o.teamCandidateSeasonClubId === canonicalEvent.seasonClubId,
        playerMatch: canonicalEvent.playerId === null || o.playerCandidatePlayerId === null ? null : o.playerCandidatePlayerId === canonicalEvent.playerId,
        eventTypeMatch: o.eventCandidateType === null ? null : o.eventCandidateType === canonicalEvent.eventType,
        shotResultMatch: null,
      };
      return { observationId: o.id, evidence, result: scoreMatch(evidence) };
    }),
  };
}

export async function persistEventMatch(input: { observationId: string; gameEventId: string; evidence: MatchEvidence }) {
  const scored = scoreMatch(input.evidence);
  return prisma.visionEventMatch.upsert({
    where: { observationId_gameEventId: { observationId: input.observationId, gameEventId: input.gameEventId } },
    create: {
      observationId: input.observationId, gameEventId: input.gameEventId, matchBand: scored.band, confidence: scored.score,
      temporalErrorMs: input.evidence.temporalErrorMs, teamMatch: input.evidence.teamMatch, playerMatch: input.evidence.playerMatch, eventTypeMatch: input.evidence.eventTypeMatch,
    },
    update: { matchBand: scored.band, confidence: scored.score, temporalErrorMs: input.evidence.temporalErrorMs, teamMatch: input.evidence.teamMatch, playerMatch: input.evidence.playerMatch, eventTypeMatch: input.evidence.eventTypeMatch },
  });
}

// Human Review (Part XXVII, LXI). Every action is AuditLog-attributed; the prior status is
// captured before the write so the audit trail records a real before/after, not just the new state.
export async function reviewObservation(observationId: string, action: VisionObservationStatus, actorId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.visionObservation.findUniqueOrThrow({ where: { id: observationId } });
    const after = await tx.visionObservation.update({ where: { id: observationId }, data: { status: action } });
    await writeAuditLog(tx, {
      userId: actorId, action: "VISION_OBSERVATION_REVIEWED", entityType: "VisionObservation", entityId: observationId,
      details: { previousStatus: before.status, newStatus: action, reason: reason ?? null },
    });
    return after;
  });
}

export async function reviewEventMatch(matchId: string, action: VisionObservationStatus, actorId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.visionEventMatch.findUniqueOrThrow({ where: { id: matchId } });
    const after = await tx.visionEventMatch.update({ where: { id: matchId }, data: { reviewStatus: action, reviewedById: actorId, reviewedAt: new Date(), reviewReason: reason ?? null } });
    await writeAuditLog(tx, {
      userId: actorId, action: "VISION_EVENT_MATCH_REVIEWED", entityType: "VisionEventMatch", entityId: matchId,
      details: { previousStatus: before.reviewStatus, newStatus: action, reason: reason ?? null },
    });
    return after;
  });
}

// Fixture Vision Workspace (Part LIX): video, alignment anchors, analysis runs, observation
// counts, canonical event match coverage, and the review queue - the primary internal workspace
// this track builds.
export async function getFixtureVisionWorkspaceData(fixtureId: string, gameVideoId: string | null) {
  const videos = await listGameVideosForFixture(fixtureId);
  const selected = gameVideoId ? videos.find((v) => v.id === gameVideoId) ?? videos[0] ?? null : videos[0] ?? null;
  if (!selected) return { videos, selected: null, canonicalEvents: [], observations: [], eventMatches: [], reviewObservations: [], reviewMatches: [] };

  const canonicalEvents = selected.gameId
    ? await prisma.gameEvent.findMany({
        where: { gameId: selected.gameId, status: "ACTIVE", eventType: { in: ["SCORE", "SHOT_MADE", "SHOT_MISSED", "REBOUND", "OFFENSIVE_REBOUND", "DEFENSIVE_REBOUND"] } },
        orderBy: { sequenceNumber: "asc" },
        select: { id: true, eventType: true, period: true, clockSeconds: true, seasonClubId: true, playerId: true, made: true, description: true },
      })
    : [];

  const [observations, eventMatches] = await Promise.all([
    prisma.visionObservation.findMany({ where: { gameVideoId: selected.id }, orderBy: { videoTimeMs: "asc" }, take: 200 }),
    prisma.visionEventMatch.findMany({ where: { observation: { gameVideoId: selected.id } }, include: { observation: true, gameEvent: { select: { id: true, description: true, eventType: true } } }, orderBy: { createdAt: "desc" } }),
  ]);

  const reviewObservations = observations.filter((o) => o.status === "PENDING");
  const reviewMatches = eventMatches.filter((m) => m.reviewStatus === "PENDING");

  return { videos, selected, canonicalEvents, observations, eventMatches, reviewObservations, reviewMatches };
}

// --- G.22: Court Specification (Part IV-V) ---

export async function createDraftCourtSpecification(input: { venueId: string; effectiveSeasonId: string | null; createdById: string }) {
  const latest = await prisma.courtSpecification.findFirst({ where: { venueId: input.venueId }, orderBy: { version: "desc" } });
  return prisma.$transaction(async (tx) => {
    const spec = await tx.courtSpecification.create({
      data: { venueId: input.venueId, version: (latest?.version ?? 0) + 1, status: "DRAFT", effectiveSeasonId: input.effectiveSeasonId, createdById: input.createdById },
    });
    await writeAuditLog(tx, { userId: input.createdById, action: "COURT_SPECIFICATION_CREATED", entityType: "CourtSpecification", entityId: spec.id, details: { venueId: input.venueId, version: spec.version } });
    return spec;
  });
}

export async function updateDraftCourtSpecification(id: string, patch: {
  courtLengthUnits?: number | null; courtWidthUnits?: number | null; units?: string;
  originDescription?: string | null; basketACourtX?: number | null; basketACourtY?: number | null;
  basketBCourtX?: number | null; basketBCourtY?: number | null; halfCourtX?: number | null;
  fourPointGeometry?: object | null;
}, actorId: string) {
  const existing = await prisma.courtSpecification.findUniqueOrThrow({ where: { id } });
  if (existing.status !== "DRAFT") throw new Error("Only a DRAFT court specification can be edited - create a new version instead of editing an OFFICIAL one.");
  const { fourPointGeometry, ...rest } = patch;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.courtSpecification.update({
      where: { id },
      data: { ...rest, ...(fourPointGeometry !== undefined ? { fourPointGeometry: fourPointGeometry ?? Prisma.JsonNull } : {}) },
    });
    await writeAuditLog(tx, { userId: actorId, action: "COURT_SPECIFICATION_UPDATED", entityType: "CourtSpecification", entityId: id, details: { patch } });
    return updated;
  });
}

// The one action that makes a CourtSpecification eligible for real spatial rule evaluation
// (four-point-spatial-rule.ts refuses OPPOSITE_HALF_ORIGIN evaluation for anything but an
// OFFICIAL spec). Deliberately a separate, explicit, audited action from creation/editing - Part
// IV's "do NOT invent them... stop before populating unknown values" means promotion should be a
// deliberate human act, never a default.
export async function markCourtSpecificationOfficial(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.courtSpecification.update({ where: { id }, data: { status: "OFFICIAL" } });
    await writeAuditLog(tx, { userId: actorId, action: "COURT_SPECIFICATION_MARKED_OFFICIAL", entityType: "CourtSpecification", entityId: id, details: {} });
    return updated;
  });
}

export async function listCourtSpecifications() {
  return prisma.courtSpecification.findMany({ include: { venue: true, effectiveSeason: true }, orderBy: [{ venueId: "asc" }, { version: "desc" }] });
}

// --- G.22: Video ingestion (Part IX-XIII) ---

export async function setGameVideoIngestStatus(gameVideoId: string, status: import("@/generated/prisma/enums").VideoIngestStatus, patch: { codec?: string; container?: string; hasAudio?: boolean; durationSeconds?: number; frameRate?: number; resolutionWidth?: number; resolutionHeight?: number; probeError?: string } = {}) {
  return prisma.gameVideo.update({ where: { id: gameVideoId }, data: { ingestStatus: status, probedAt: new Date(), ...patch } });
}

// --- G.22: game attacking-direction setup (Part VIII) ---

export async function setGameAttackingDirection(gameId: string, homeAttacksBasketFirstHalf: import("@/generated/prisma/enums").CourtBasketSide, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.game.update({ where: { id: gameId }, data: { homeAttacksBasketFirstHalf } });
    await writeAuditLog(tx, { userId: actorId, action: "GAME_ATTACKING_DIRECTION_SET", entityType: "Game", entityId: gameId, details: { homeAttacksBasketFirstHalf } });
    return updated;
  });
}

// --- G.22: failure case gallery (Part LII) ---

export async function listFailureCases() {
  const [observations, matches] = await Promise.all([
    prisma.visionObservation.findMany({ where: { failureCategory: { not: null } }, include: { gameVideo: { include: { fixture: { include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.visionEventMatch.findMany({ where: { failureCategory: { not: null } }, include: { observation: { include: { gameVideo: { include: { fixture: { include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } } } } } } }, gameEvent: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return { observations, matches };
}

export async function setObservationFailureCategory(observationId: string, category: import("@/generated/prisma/enums").VisionFailureCategory, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.visionObservation.update({ where: { id: observationId }, data: { failureCategory: category } });
    await writeAuditLog(tx, { userId: actorId, action: "VISION_OBSERVATION_FAILURE_TAGGED", entityType: "VisionObservation", entityId: observationId, details: { category } });
    return updated;
  });
}

// --- G.22: evaluation dataset export (Part LXV) ---

export type DatasetExportRow = {
  fixturePublicId: string;
  gameVideoId: string;
  videoTimeMs: number;
  period: number | null;
  clockSeconds: number | null;
  groundTruthEventType: string | null;
  visionObservationType: string;
  visionConfidence: number;
  matchBand: string | null;
  reviewStatus: string;
  playerPublicId: string | null;
};

// Public-safe fields only (Part LXV/XXXIII): fixture id (already the public routing id per
// G.20's own precedent), video-relative timestamps, event/observation type labels, confidence,
// match band, review status, and the player's PUBLIC ultraAthleteId - never a raw internal
// Player/Athlete id, never any contact/PII field, never a frame image (Part XXXIV).
export async function buildEvaluationDatasetExport(gameVideoId: string): Promise<DatasetExportRow[]> {
  const observations = await prisma.visionObservation.findMany({
    where: { gameVideoId },
    include: {
      eventMatches: { include: { gameEvent: { select: { eventType: true, period: true, clockSeconds: true } } } },
      playerCandidatePlayer: { select: { athlete: { select: { ultraAthleteId: true } } } },
      gameVideo: { select: { fixtureId: true } },
    },
    orderBy: { videoTimeMs: "asc" },
  });

  return observations.map((o) => {
    const bestMatch = o.eventMatches[0] ?? null;
    return {
      fixturePublicId: o.gameVideo.fixtureId,
      gameVideoId: o.gameVideoId,
      videoTimeMs: o.videoTimeMs,
      period: bestMatch?.gameEvent.period ?? null,
      clockSeconds: bestMatch?.gameEvent.clockSeconds ?? null,
      groundTruthEventType: bestMatch?.gameEvent.eventType ?? null,
      visionObservationType: o.observationType,
      visionConfidence: o.confidence,
      matchBand: bestMatch?.matchBand ?? null,
      reviewStatus: o.status,
      playerPublicId: o.playerCandidatePlayer?.athlete.ultraAthleteId ?? null,
    };
  });
}

export function datasetExportToJsonl(rows: DatasetExportRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

export async function getVisionDashboardData() {
  const videos = await prisma.gameVideo.findMany({
    include: {
      fixture: { include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } } },
      analysisRuns: { include: { visionModel: true }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { observations: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const [reviewPending, matchesPending] = await Promise.all([
    prisma.visionObservation.count({ where: { status: "PENDING" } }),
    prisma.visionEventMatch.count({ where: { reviewStatus: "PENDING" } }),
  ]);
  return { videos, reviewPending, matchesPending };
}
