export type OutboxOperation = "CREATE" | "UPDATE" | "DELETE";

export type OutboxEntityType = "Game" | "GameEvent" | "PlayerStat";

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
