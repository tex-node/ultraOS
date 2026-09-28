// Pure orchestration for the sync outbox's authorize-then-replay flow - no Prisma, no auth, no
// server-only. Every dependency (fixture resolution, permission check, per-record replay) is
// injected, so this function's own contract - "if authorization fails, replay is never called for
// any record" - is provable with a mock replay function and a call-count assertion, without a
// database. That's equivalent proof to "zero rows created": replay is the only thing that ever
// writes, so a replay call count of zero means zero rows, real DB or not.
//
// route.ts wires in the real implementations (resolveFixtureIds wrapped in
// withOrganizationContext, checkFixturePermission = requireFixturePermission, replay =
// replayOutboxRecord). Tests wire in mocks/stubs.
import { sortRecordsForProcessing, type OutboxRecord, type SyncOutboxRecordResult } from "./outbox-schema";
import { checkAllFixturesAuthorized } from "./authorize-batch";

export interface ProcessOutboxBatchDeps {
  resolveFixtureIds: (records: OutboxRecord[]) => Promise<Set<string>>;
  checkFixturePermission: (fixtureId: string) => Promise<void>;
  isAuthorizationError: (error: unknown) => boolean;
  replay: (record: OutboxRecord) => Promise<SyncOutboxRecordResult>;
}

export type ProcessOutboxBatchOutcome =
  | { authorized: true; results: SyncOutboxRecordResult[] }
  | { authorized: false; message: string };

export async function processOutboxBatch(records: OutboxRecord[], deps: ProcessOutboxBatchDeps): Promise<ProcessOutboxBatchOutcome> {
  if (records.length === 0) {
    return { authorized: true, results: [] };
  }

  const orderedRecords = sortRecordsForProcessing(records);
  const fixtureIds = await deps.resolveFixtureIds(orderedRecords);

  // The whole batch rejects on the first unauthorized fixture, before `deps.replay` is called for
  // ANY record - see checkAllFixturesAuthorized's own tests for the specific failure mode this
  // guards (a bad-organization Game and its dependent GameEvent both resolve to the same
  // fixtureId, so this one check covers both).
  const authError = await checkAllFixturesAuthorized(
    fixtureIds,
    deps.checkFixturePermission,
    (error): error is Error => deps.isAuthorizationError(error),
  );
  if (authError) {
    return { authorized: false, message: authError.message };
  }

  const results: SyncOutboxRecordResult[] = [];
  for (const record of orderedRecords) {
    results.push(await deps.replay(record));
  }
  return { authorized: true, results };
}
