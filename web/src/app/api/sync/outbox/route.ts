import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { AuthenticationError, AuthorizationError, requireFixturePermission, requireSession } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import {
  type OutboxRecord,
  type SyncOutboxRecordResult,
  sortRecordsForProcessing,
  syncOutboxRequestSchema,
} from "@/lib/sync/outbox-schema";

// A3b Commit 2: the sync-replay endpoint's skeleton. Validates the request, enforces the batch
// size limit, resolves and checks authorization for every game the batch touches, and returns a
// correctly-shaped response - but does not write anything yet. Commit 3 replaces the placeholder
// per-record results with the real idempotency-checked canonical-write replay.

// Authorization pre-check scope: every game the batch touches, checked before any record is
// processed - not resolved lazily per-record as processing reaches it. A Game record's payload
// carries fixtureId directly; a GameEvent record only carries gameId, so its fixtureId is resolved
// first from an in-batch Game.CREATE record for that same gameId (the game may not exist in the
// DB yet, if this very batch is the one creating it), falling back to a DB lookup only for a game
// that already exists from an earlier, already-synced batch.
async function resolveFixtureIdsToAuthorize(tx: Prisma.TransactionClient, records: OutboxRecord[]): Promise<Set<string>> {
  const fixtureIds = new Set<string>();
  const fixtureIdByGameId = new Map<string, string>();

  for (const record of records) {
    if (record.entityType !== "Game") continue;
    const payload = record.payload as { fixtureId?: unknown } | null;
    const fixtureId = typeof payload?.fixtureId === "string" ? payload.fixtureId : undefined;
    if (fixtureId) {
      fixtureIds.add(fixtureId);
      fixtureIdByGameId.set(record.entityId, fixtureId);
    }
  }

  const unresolvedGameIds = new Set<string>();
  for (const record of records) {
    if (record.entityType !== "GameEvent") continue;
    const payload = record.payload as { gameId?: unknown } | null;
    const gameId = typeof payload?.gameId === "string" ? payload.gameId : undefined;
    if (!gameId) continue;
    const knownFixtureId = fixtureIdByGameId.get(gameId);
    if (knownFixtureId) {
      fixtureIds.add(knownFixtureId);
    } else {
      unresolvedGameIds.add(gameId);
    }
  }

  if (unresolvedGameIds.size > 0) {
    const games = await tx.game.findMany({
      where: { id: { in: [...unresolvedGameIds] } },
      select: { fixtureId: true },
    });
    for (const game of games) fixtureIds.add(game.fixtureId);
  }

  return fixtureIds;
}

export async function POST(request: Request) {
  // Authentication is checked first, unconditionally - before body parsing, before the
  // empty-batch shortcut - so an unauthenticated request never gets a 200 regardless of what its
  // (possibly trivial) body contains.
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    throw error;
  }
  const organizationId = session.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "No resolved organization context." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }

  const parsed = syncOutboxRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }
  const { records } = parsed.data;

  // Empty batch: a valid request with no work to do, not an error.
  if (records.length === 0) {
    const results: SyncOutboxRecordResult[] = [];
    return NextResponse.json({ results });
  }

  const orderedRecords = sortRecordsForProcessing(records);

  const fixtureIds = await withOrganizationContext(organizationId, (tx) => resolveFixtureIdsToAuthorize(tx, orderedRecords));

  // Sequential, not nested inside the transaction above: requireFixturePermission opens its own
  // transaction internally, and Prisma's interactive transactions aren't meant to nest.
  for (const fixtureId of fixtureIds) {
    try {
      await requireFixturePermission("game:operate", fixtureId);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }
  }

  // Commit 2 stops here: the request is validated, sized, ordered, and authorized, but nothing is
  // written yet. Commit 3 replaces this placeholder with the real per-record idempotency check
  // (SyncIdempotency) and canonical-write replay (createGame/createGameEvent). Results are
  // returned in the server-processed order established above, not necessarily the request's
  // original array order - the client correlates by idempotencyKey, not by array position.
  const results: SyncOutboxRecordResult[] = orderedRecords.map((record) => ({
    idempotencyKey: record.idempotencyKey,
    status: "APPLIED",
  }));

  return NextResponse.json({ results });
}
