import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthenticationError, AuthorizationError, requireFixturePermission, requireSession } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { processOutboxBatch } from "@/lib/sync/process-outbox-batch";
import { syncOutboxRequestSchema } from "@/lib/sync/outbox-schema";
import { resolveFixtureIdsToAuthorize } from "@/server/sync/resolve-batch-authorization";
import { replayOutboxRecord } from "@/server/sync/replay-outbox-record";

// A3b: the sync-replay endpoint. Validates the request, enforces the batch size limit, resolves
// and checks authorization for every game the batch touches (before any record is processed),
// then replays each record serially against a real per-record idempotency check and canonical
// write (Commit 3). The authorize-then-replay orchestration itself lives in
// processOutboxBatch (src/lib/sync/) - this route wires in the real dependencies
// (withOrganizationContext-scoped fixture resolution, requireFixturePermission, replayOutboxRecord
// against the real prisma client); process-outbox-batch.test.ts proves the orchestration's own
// contract (auth rejection calls replay zero times) with injected mocks, no database needed.
//
// Route registration verified directly (2026-09-28): curled http://127.0.0.1:4120/api/sync/outbox
// on the staging host itself, bypassing the external reverse proxy - a compile-clean route file
// and a green `next build` don't prove App Router actually registered it. Got 401 (auth checked
// before body validation, as designed), not 404 - confirmed against a known-good existing route
// returning something other than 404 too, from the same host, same way. Confirmed separately that
// production's own public URL (no /staging prefix) serves API routes correctly - the 404 was
// staging's reverse-proxy path-prefix handling, not a systemic issue.

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

  const syncBatchId = randomUUID();
  const outcome = await processOutboxBatch(parsed.data.records, {
    resolveFixtureIds: (records) => withOrganizationContext(organizationId, (tx) => resolveFixtureIdsToAuthorize(tx, records)),
    checkFixturePermission: (fixtureId) => requireFixturePermission("game:operate", fixtureId).then(() => undefined),
    isAuthorizationError: (error): error is AuthorizationError => error instanceof AuthorizationError,
    replay: (record) =>
      replayOutboxRecord(record, {
        actor: { id: session.user.id, organizationId },
        deviceId: parsed.data.deviceId,
        syncBatchId,
        prisma,
      }),
  });

  if (!outcome.authorized) {
    return NextResponse.json({ error: outcome.message }, { status: 403 });
  }
  return NextResponse.json({ results: outcome.results });
}
