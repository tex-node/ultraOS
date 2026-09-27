import { offlineDb, type OfflineScoringDatabase } from "./db";
import type { OutboxEnqueueInput, OutboxRecord } from "./types";

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export async function enqueue(
  input: OutboxEnqueueInput,
  db: OfflineScoringDatabase = offlineDb,
): Promise<number> {
  const record: OutboxRecord = {
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    clientUpdatedAt: input.clientUpdatedAt ?? new Date().toISOString(),
    idempotencyKey: input.idempotencyKey ?? generateIdempotencyKey(),
    deviceId: input.deviceId,
    syncedAt: null,
    failureReason: null,
  };
  return db.outbox.add(record);
}

export async function drain(
  batchSize = 50,
  db: OfflineScoringDatabase = offlineDb,
): Promise<OutboxRecord[]> {
  const pending = await db.outbox
    .filter((record) => !record.syncedAt && !record.failureReason)
    .sortBy("clientUpdatedAt");
  return pending.slice(0, batchSize);
}

export async function markSynced(
  localIds: number[],
  db: OfflineScoringDatabase = offlineDb,
): Promise<void> {
  await db.outbox.bulkUpdate(
    localIds.map((localId) => ({
      key: localId,
      changes: { syncedAt: new Date().toISOString() },
    })),
  );
}

export async function markFailed(
  localId: number,
  reason: string,
  db: OfflineScoringDatabase = offlineDb,
): Promise<void> {
  await db.outbox.update(localId, { failureReason: reason });
}

export async function pendingCount(db: OfflineScoringDatabase = offlineDb): Promise<number> {
  return db.outbox.filter((record) => !record.syncedAt && !record.failureReason).count();
}
