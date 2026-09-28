import { checkAllFixturesAuthorized } from "./authorize-batch";
import assert from "node:assert/strict";
import test from "node:test";

class FakeAuthorizationError extends Error {
  readonly name = "FakeAuthorizationError";
}
class FakeUnrelatedError extends Error {}

const isFake = (e: unknown): e is FakeAuthorizationError => e instanceof FakeAuthorizationError;

test("all fixtures authorized: returns null, calls the check for every fixture", async () => {
  const checked: string[] = [];
  const result = await checkAllFixturesAuthorized(
    ["fixture-a", "fixture-b", "fixture-c"],
    async (fixtureId) => {
      checked.push(fixtureId);
    },
    isFake,
  );
  assert.equal(result, null);
  assert.deepEqual(checked, ["fixture-a", "fixture-b", "fixture-c"]);
});

// This is the specific failure mode named for the "synthesized reference" mechanism: a batch
// containing a Game CREATE for a fixture the caller can't write to, and a GameEvent referencing
// that same Game via its client-side id, resolve to the SAME fixtureId (proven separately in
// resolve-batch-authorization.test.ts) - so this single fixtureId failing here is what makes the
// whole batch reject, not just the one Game record.
test("one unauthorized fixture: rejects the whole check, does not call checkPermission for fixtures after it", async () => {
  const checked: string[] = [];
  const result = await checkAllFixturesAuthorized(
    ["fixture-a", "fixture-bad", "fixture-c"],
    async (fixtureId) => {
      checked.push(fixtureId);
      if (fixtureId === "fixture-bad") throw new FakeAuthorizationError("no access");
    },
    isFake,
  );
  assert.ok(result instanceof FakeAuthorizationError);
  assert.deepEqual(checked, ["fixture-a", "fixture-bad"], "must stop at the first unauthorized fixture, never reach fixture-c");
});

test("an unrelated error is not swallowed as an authorization rejection - it propagates", async () => {
  await assert.rejects(
    () =>
      checkAllFixturesAuthorized(
        ["fixture-a"],
        async () => {
          throw new FakeUnrelatedError("db connection lost");
        },
        isFake,
      ),
    FakeUnrelatedError,
  );
});
