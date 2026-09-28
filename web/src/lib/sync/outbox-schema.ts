// The sync outbox's wire contract - pure (no Prisma, no server-only, no auth) so it's testable
// without a database or a request. src/app/api/sync/outbox/route.ts imports this rather than
// defining the schema inline, the same split this project uses everywhere else (pure contract/
// logic in src/lib, I/O and auth glue in the server/route layer).
import { z } from "zod";

export const MAX_BATCH_SIZE = 100;

// Mirrors src/lib/offline/types.ts's OutboxEntityType exactly - the client and server must agree
// on this constraint from one place, not two independently-maintained lists.
//
// ledgerSourceHint: added in Commit 3, correcting a Commit 2 gap - the A3b sketch's Point 2
// (docs/canonical-write-audit.md) already decided this field is required on the wire for every
// GameEvent record before Commit 2 was written, and Commit 2's schema omitted it. Required only
// for GameEvent (a Game record has no scorer/statistician distinction) - enforced below via
// superRefine rather than a discriminated union, since every other field is shared between both
// entity types and a union would duplicate the whole shape for one conditional field.
export const outboxRecordSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    entityType: z.enum(["Game", "GameEvent"]),
    operation: z.enum(["CREATE", "UPDATE", "DELETE"]),
    // UUID, not the server's own cuid format: there is no existing caller to match today (zero
    // current UI creates a Game/GameEvent offline), so this is a forward-looking decision, not a
    // confirmed existing convention - chosen to match crypto.randomUUID(), the same generator
    // src/lib/offline/outbox.ts already uses for idempotencyKey. A client-generated id never
    // collides with a server-generated one regardless of format (different generation schemes,
    // both globally unique by construction) - this constraint is about giving future client code
    // one clear answer, not about avoiding a collision risk that doesn't otherwise exist.
    entityId: z.string().uuid(),
    payload: z.unknown(),
    clientUpdatedAt: z.string().datetime(),
    ledgerSourceHint: z.enum(["SCORER", "STATISTICIAN"]).optional(),
  })
  .superRefine((record, ctx) => {
    if (record.entityType === "GameEvent" && !record.ledgerSourceHint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ledgerSourceHint is required for GameEvent records - it determines which console's ledger the replayed event belongs to.",
        path: ["ledgerSourceHint"],
      });
    }
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
