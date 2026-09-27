// Pure builder for the canonical GameEvent create payload. Lives in src/lib/scoring (no Prisma
// client, no server-only) so it is unit-testable and shared with the server write path. The I/O
// around it (locking, sequence assignment, the actual insert) lives in src/server/scoring/.
//
// This is the single place the field SHAPE lives. The characterization test asserts it byte-for-
// byte, so a refactor that changes how a field defaults (e.g. an absent `data` field becoming
// JSONB-null instead of SQL NULL) is caught in CI rather than discovered months later.

import type { Prisma } from "@/generated/prisma/client";
import type { EventProvenance } from "@/server/scoring/types";

export type LedgerSourceValue =
  | "OFFLINE_SYNC"
  | "EXTERNAL_PROVIDER"
  | "MANUAL_ADMIN_ENTRY"
  | "ULTRA_NATIVE_LIVE_SCORER"
  | "ULTRA_NATIVE_LIVE_STATISTICIAN";

export interface GameEventFields {
  gameId: string;
  sequenceNumber: number; // Assigned by the service (from Game.nextEventSequence)
  eventType: string;
  period: number;
  clockSeconds: number;
  description: string;
  seasonClubId?: string | null;
  entrantId?: string | null;
  playerId?: string | null;
  fouledPlayerId?: string | null;
  foulType?: string | null;
  technicalClass?: string | null; // NCAA-style: Class A vs Class B technicals
  foulTarget?: string | null; // PLAYER, BENCH, or COACH
  freeThrowsAwarded?: number | null; // Number of free throws awarded by a foul
  causedByEventId?: string | null;
  typeKey?: string | null;
  data?: Prisma.InputJsonValue | null;
  points?: number | null;
  basePointValue?: number | null;
  multiplier?: number | null;
  made?: boolean | null;
  isFourPointAttempt?: boolean;
  isUltraTime?: boolean;
  assistedByPlayerId?: string | null;
  substitutedOutPlayerId?: string | null;
  x?: number | null;
  y?: number | null;
  courtZone?: string | null;
  homeScoreBefore?: number | null;
  awayScoreBefore?: number | null;
  homeScoreAfter?: number | null;
  awayScoreAfter?: number | null;
  supersedesEventId?: string | null;
}

export interface GameEventWriteMeta {
  organizationId: string;
  actorId: string;
  source: LedgerSourceValue;
  provenance?: EventProvenance;
}

export function buildGameEventCreateData(
  input: GameEventFields,
  meta: GameEventWriteMeta,
): Prisma.GameEventUncheckedCreateInput {
  return {
    organizationId: meta.organizationId,
    gameId: input.gameId,
    sequenceNumber: input.sequenceNumber,
    seasonClubId: input.seasonClubId ?? null,
    entrantId: input.entrantId ?? null,
    playerId: input.playerId ?? null,
    fouledPlayerId: input.fouledPlayerId ?? null,
    foulType: (input.foulType as Prisma.GameEventUncheckedCreateInput["foulType"]) ?? null,
    technicalClass: (input.technicalClass as Prisma.GameEventUncheckedCreateInput["technicalClass"]) ?? null,
    foulTarget: (input.foulTarget as Prisma.GameEventUncheckedCreateInput["foulTarget"]) ?? null,
    freeThrowsAwarded: input.freeThrowsAwarded ?? null,
    causedByEventId: input.causedByEventId ?? null,
    eventType: input.eventType as Prisma.GameEventUncheckedCreateInput["eventType"],
    typeKey: input.typeKey ?? null,
    // Absent `data` omits the field (SQL NULL), which is what the original sites do. Prisma treats
    // `undefined` as "omit", so an absent field never becomes JSONB-null — that is a distinct value.
    data: input.data ?? undefined,
    points: input.points ?? null,
    basePointValue: input.basePointValue ?? null,
    multiplier: input.multiplier ?? null,
    made: input.made ?? null,
    isFourPointAttempt: input.isFourPointAttempt ?? false,
    isUltraTime: input.isUltraTime ?? false,
    assistedByPlayerId: input.assistedByPlayerId ?? null,
    substitutedOutPlayerId: input.substitutedOutPlayerId ?? null,
    x: input.x ?? null,
    y: input.y ?? null,
    courtZone: input.courtZone ?? null,
    homeScoreBefore: input.homeScoreBefore ?? null,
    awayScoreBefore: input.awayScoreBefore ?? null,
    homeScoreAfter: input.homeScoreAfter ?? null,
    awayScoreAfter: input.awayScoreAfter ?? null,
    supersedesEventId: input.supersedesEventId ?? null,
    period: input.period,
    clockSeconds: input.clockSeconds,
    description: input.description,
    source: meta.source,
    createdById: meta.actorId,
    deviceId: meta.provenance?.deviceId ?? null,
    idempotencyKey: meta.provenance?.idempotencyKey ?? null,
    clientUpdatedAt: meta.provenance?.clientUpdatedAt ? new Date(meta.provenance.clientUpdatedAt) : null,
    syncBatchId: meta.provenance?.syncBatchId ?? null,
  };
}
