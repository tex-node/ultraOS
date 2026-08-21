import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { LaunchBlockerPriority, OpsHealthStatus, OpsItemStatus } from "@/generated/prisma/enums";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

let readinessModule: typeof import("@/lib/season-zero-readiness") | null = null;

async function loadReadiness() {
  readinessModule ??= await import("@/lib/season-zero-readiness");
  return readinessModule;
}

test("GO_LIVE_READY is blocked while an open P0 exists", async () => {
  const { canMarkGoLiveReady } = await loadReadiness();
  assert.equal(canMarkGoLiveReady([{ priority: LaunchBlockerPriority.P0, status: OpsItemStatus.OPEN }]), false);
  assert.equal(canMarkGoLiveReady([{ priority: LaunchBlockerPriority.P0, status: OpsItemStatus.IN_PROGRESS }]), false);
  assert.equal(canMarkGoLiveReady([{ priority: LaunchBlockerPriority.P0, status: OpsItemStatus.COMPLETE }]), true);
  assert.equal(canMarkGoLiveReady([{ priority: LaunchBlockerPriority.P1, status: OpsItemStatus.OPEN }]), true);
});

test("readiness recommendation follows P0, P1, then amber conditions", async () => {
  const { readinessRecommendation } = await loadReadiness();
  assert.equal(readinessRecommendation({ p0: 1, p1: 0, amber: 0 }), "NOT READY");
  assert.equal(readinessRecommendation({ p0: 0, p1: 1, amber: 0 }), "READY WITH CONDITIONS");
  assert.equal(readinessRecommendation({ p0: 0, p1: 0, amber: 2 }), "READY WITH CONDITIONS");
  assert.equal(readinessRecommendation({ p0: 0, p1: 0, amber: 0 }), "READY");
});

test("Season Zero required settings cover launch operations", async () => {
  const { requiredSeasonZeroSettings, seasonZeroConfig, signalFromMissing } = await loadReadiness();
  assert.equal(seasonZeroConfig.timezone, "Africa/Lagos");
  assert.equal(seasonZeroConfig.currency, "NGN");
  assert.ok(requiredSeasonZeroSettings.includes("season-zero.minRosterSize"));
  assert.ok(requiredSeasonZeroSettings.includes("season-zero.qrCheckInRules"));
  assert.ok(requiredSeasonZeroSettings.includes("season-zero.contentPublishingDefaults"));
  assert.equal(signalFromMissing(0), OpsHealthStatus.GREEN);
  assert.equal(signalFromMissing(1), OpsHealthStatus.RED);
});

test("system seed returns before demo data creation", () => {
  const seed = readFileSync(path.join(process.cwd(), "prisma", "seed.ts"), "utf8");
  const systemReturn = seed.indexOf('if (seedMode === "system")');
  const demoClubLoop = seed.indexOf("const seededSeasonClubs");
  assert.ok(systemReturn > -1);
  assert.ok(demoClubLoop > -1);
  assert.ok(systemReturn < demoClubLoop);
});

test("demo seed is blocked in production", () => {
  const seed = readFileSync(path.join(process.cwd(), "prisma", "seed.ts"), "utf8");
  assert.match(seed, /seedMode === "demo" && process\.env\.NODE_ENV === "production"/);
});

test("readiness library excludes sensitive emergency contact fields", () => {
  const source = readFileSync(path.join(process.cwd(), "src", "lib", "season-zero-readiness.ts"), "utf8");
  assert.doesNotMatch(source, /emergencyContact/);
});
