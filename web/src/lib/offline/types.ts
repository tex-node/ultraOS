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
  // Incremented on every FAILED/CONFLICT replay result (never on APPLIED/DUPLICATE). Reaching
  // DEAD_LETTER_ATTEMPT_THRESHOLD (outbox.ts) sets deadLetteredAt below.
  attemptCount: number;
  // Set once attemptCount crosses DEAD_LETTER_ATTEMPT_THRESHOLD - readPendingBatch/pendingCount
  // exclude a dead-lettered record from further automatic retry; retryDeadLetteredRecords clears
  // this (and resets attemptCount) for a manual retry.
  deadLetteredAt?: string | null;
  // Stamped by retryDeadLetteredRecords on every reset it actually performs - MANUAL_RETRY_COOLDOWN_MS
  // (outbox.ts) uses this to stop a permanently-failing record from being reset (and burning
  // another 5 attempts) on every repeated click within the cooldown window.
  lastManualRetryAt?: string | null;
  // Wire-required for GameEvent only (outbox-schema.ts's superRefine) - which console's ledger a
  // replayed event belongs to. A Game record has no scorer/statistician distinction, so this is
  // absent for those.
  ledgerSourceHint?: "SCORER" | "STATISTICIAN";
}

export interface OutboxEnqueueInput {
  entityType: OutboxEntityType;
  entityId: string;
  operation: OutboxOperation;
  payload: unknown;
  clientUpdatedAt?: string;
  deviceId: string;
  idempotencyKey?: string;
  ledgerSourceHint?: "SCORER" | "STATISTICIAN";
}

export type SyncResultStatus = "APPLIED" | "DUPLICATE" | "CONFLICT" | "FAILED";

export interface SyncResult {
  idempotencyKey: string;
  status: SyncResultStatus;
  reason?: string;
}
