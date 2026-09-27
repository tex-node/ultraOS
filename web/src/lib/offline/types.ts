export type OutboxOperation = "CREATE" | "UPDATE" | "DELETE";

// Invariant (A3a/A3b boundary, see docs/canonical-write-audit.md "Open question before A3b"):
// the outbox carries Game and GameEvent only. PlayerStat/TeamStat are projections derived
// server-side from the event ledger - never wire entities. A future feature that needs the
// server to know something about stats sends the events it derives from, not the stats
// themselves. Enforced here at the type level, not just by convention: adding "PlayerStat" (or
// "TeamStat") back to this union is the thing this comment exists to prevent.
export type OutboxEntityType = "Game" | "GameEvent";

export interface OutboxRecord {
  localId?: number;
  entityType: OutboxEntityType;
  entityId: string;
  operation: OutboxOperation;
  payload: unknown;
  clientUpdatedAt: string;
  idempotencyKey: string;
  deviceId: string;
  syncedAt?: string | null;
  failureReason?: string | null;
}

export interface OutboxEnqueueInput {
  entityType: OutboxEntityType;
  entityId: string;
  operation: OutboxOperation;
  payload: unknown;
  clientUpdatedAt?: string;
  deviceId: string;
  idempotencyKey?: string;
}

export type SyncResultStatus = "APPLIED" | "DUPLICATE" | "CONFLICT" | "FAILED";

export interface SyncResult {
  idempotencyKey: string;
  status: SyncResultStatus;
  reason?: string;
}
