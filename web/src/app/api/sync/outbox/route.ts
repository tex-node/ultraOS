import { NextResponse } from "next/server";
import { AuthenticationError, AuthorizationError, requireFixturePermission, requireSession } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { checkAllFixturesAuthorized } from "@/lib/sync/authorize-batch";
import { type SyncOutboxRecordResult, sortRecordsForProcessing, syncOutboxRequestSchema } from "@/lib/sync/outbox-schema";
import { resolveFixtureIdsToAuthorize } from "@/server/sync/resolve-batch-authorization";

// A3b Commit 2: the sync-replay endpoint's skeleton. Validates the request, enforces the batch
// size limit, resolves and checks authorization for every game the batch touches, and returns a
// correctly-shaped response - but does not write anything yet. Commit 3 replaces the placeholder
// per-record results with the real idempotency-checked canonical-write replay.
//
// Route registration verified directly (2026-09-28): curled http://127.0.0.1:4120/api/sync/outbox
// on the staging host itself, bypassing the external reverse proxy - a compile-clean route file
// and a green `next build` don't prove App Router actually registered it. Got 401 (auth checked
// before body validation, as designed), not 404 - confirmed against a known-good existing route
// returning something other than 404 too, from the same host, same way.

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
  // transaction internally, and Prisma's interactive transactions aren't meant to nest. The whole
  // batch rejects on the first unauthorized fixture - see checkAllFixturesAuthorized's own tests
  // for the specific failure mode (a bad-organization Game plus a dependent GameEvent referencing
  // it via client id both resolve to the same fixtureId, so this one check covers both).
  const authError = await checkAllFixturesAuthorized(
    fixtureIds,
    (fixtureId) => requireFixturePermission("game:operate", fixtureId).then(() => undefined),
    (error): error is AuthorizationError => error instanceof AuthorizationError,
  );
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 403 });
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
