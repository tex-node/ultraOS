import assert from "node:assert/strict";
import test from "node:test";
import { LaunchBlockerPriority, OpsItemStatus } from "@/generated/prisma/enums";
import { formatPublicId } from "@/lib/public-ids";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

let profileModule: typeof import("@/lib/participant-profiles") | null = null;
let readinessModule: typeof import("@/lib/season-zero-readiness") | null = null;

async function profiles() {
  profileModule ??= await import("@/lib/participant-profiles");
  return profileModule;
}

async function readiness() {
  readinessModule ??= await import("@/lib/season-zero-readiness");
  return readinessModule;
}

test("public ID formatter is stable and zero padded", () => {
  assert.equal(formatPublicId("UBA", "ATHLETE", 1), "UBA-000001");
  assert.equal(formatPublicId("UBA", "ATHLETE", BigInt(42)), "UBA-000042");
  assert.equal(formatPublicId("UBS", "STAFF", 7), "UBS-000007");
});

test("public ID formatter uses the given organization's own prefix, not a hardcoded one", () => {
  assert.equal(formatPublicId("XYZ", "ATHLETE", 1), "XYZ-000001");
});

test("profile completeness classifies missing permanent profile fields", async () => {
  const { athleteCompleteness, publicProfileKeys, staffCompleteness } = await profiles();
  assert.equal(athleteCompleteness({ firstName: "A", lastName: "B", registrations: [] }).status, "BLOCKED");
  assert.equal(staffCompleteness({ ultraStaffId: "UBS-000001", name: "Coach", email: "coach@example.test", role: "HEAD_COACH" }).status, "COMPLETE");
  assert.deepEqual(publicProfileKeys({ ultraAthleteId: "UBA-000001", name: "Jane", email: "x", phone: "1", emergencyContact: "hidden" }), ["ultraAthleteId", "name"]);
});

test("GO_LIVE_READY still rejects open P0 blockers after participant schema additions", async () => {
  const { canMarkGoLiveReady } = await readiness();
  assert.equal(canMarkGoLiveReady([{ priority: LaunchBlockerPriority.P0, status: OpsItemStatus.OPEN }]), false);
});
