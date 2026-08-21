import assert from "node:assert/strict";
import test from "node:test";
import { OpsHealthStatus, OpsItemStatus } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

let operationsModule: typeof import("@/lib/operations") | null = null;

async function loadOperations() {
  operationsModule ??= await import("@/lib/operations");
  return operationsModule;
}

test("statusFromCounts prioritizes red, then amber, then green", async () => {
  const { statusFromCounts } = await loadOperations();
  assert.equal(statusFromCounts(1, 0), OpsHealthStatus.RED);
  assert.equal(statusFromCounts(1, 5), OpsHealthStatus.RED);
  assert.equal(statusFromCounts(0, 2), OpsHealthStatus.AMBER);
  assert.equal(statusFromCounts(0, 0), OpsHealthStatus.GREEN);
});

test("isOverdue ignores closed operational items", async () => {
  const { isOverdue } = await loadOperations();
  const past = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 60_000);

  assert.equal(isOverdue(past, OpsItemStatus.OPEN), true);
  assert.equal(isOverdue(past, OpsItemStatus.IN_PROGRESS), true);
  assert.equal(isOverdue(past, OpsItemStatus.COMPLETE), false);
  assert.equal(isOverdue(past, OpsItemStatus.CANCELLED), false);
  assert.equal(isOverdue(future, OpsItemStatus.OPEN), false);
  assert.equal(isOverdue(null, OpsItemStatus.OPEN), false);
});

test("operations permissions are restricted to operators and super admins", () => {
  assert.equal(hasPermission(["SUPER_ADMIN"], "operations:manage"), true);
  assert.equal(hasPermission(["LEAGUE_OPERATOR"], "incident:manage"), true);
  assert.equal(hasPermission(["TEAM_MANAGER"], "operations:view"), false);
  assert.equal(hasPermission(["COACH"], "equipment:manage"), false);
  assert.equal(hasPermission(["FAN"], "operations:view"), false);
});
