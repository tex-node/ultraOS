// The sync outbox's wire contract - pure (no Prisma, no server-only, no auth) so it's testable
// without a database or a request. src/app/api/sync/outbox/route.ts imports this rather than
// defining the schema inline, the same split this project uses everywhere else (pure contract/
// logic in src/lib, I/O and auth glue in the server/route layer).
import { z } from "zod";

export const MAX_BATCH_SIZE = 100;

// Mirrors src/lib/offline/types.ts's OutboxEntityType exactly - the client and server must agree
// on this constraint from one place, not two independently-maintained lists.
export const outboxRecordSchema = z.object({
  idempotencyKey: z.string().uuid(),
  entityType: z.enum(["Game", "GameEvent"]),
  operation: z.enum(["CREATE", "UPDATE", "DELETE"]),
  entityId: z.string().min(1),
  payload: z.unknown(),
  clientUpdatedAt: z.string().datetime(),
});

// No `.min()` on records: an empty batch is a valid request (200, { results: [] }), not a
// validation error - the client's retry logic never needs a special case for "nothing pending".
export const syncOutboxRequestSchema = z.object({
  deviceId: z.string().min(1),
  records: z.array(outboxRecordSchema).max(MAX_BATCH_SIZE),
});

export type OutboxRecord = z.infer<typeof outboxRecordSchema>;
export type SyncOutboxRequest = z.infer<typeof syncOutboxRequestSchema>;

export interface SyncOutboxRecordResult {
  idempotencyKey: string;
  status: "APPLIED" | "DUPLICATE" | "CONFLICT" | "FAILED";
  detail?: unknown;
}

// Ordering rule (A3b decision, not left implicit): clientUpdatedAt ascending, idempotencyKey as
// tiebreaker, enforced server-side regardless of the array order the client actually sent - a
// client-side IndexedDB iteration-order quirk must never let a GameEvent be processed ahead of
// the Game.CREATE it depends on if their clientUpdatedAt values say otherwise. Compares parsed
// timestamps numerically, not the ISO strings lexicographically - correct regardless of exact
// formatting differences (fractional-second precision, etc.) between records.
export function sortRecordsForProcessing<T extends { clientUpdatedAt: string; idempotencyKey: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const byTime = new Date(a.clientUpdatedAt).getTime() - new Date(b.clientUpdatedAt).getTime();
    if (byTime !== 0) return byTime;
    return a.idempotencyKey.localeCompare(b.idempotencyKey);
  });
}
