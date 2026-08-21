import assert from "node:assert/strict";
import test from "node:test";
import {
  AllocationSubjectType,
  DraftEventOperatingMode,
  DraftEventStage,
} from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

let draftEventsModule: typeof import("@/lib/draft-events") | null = null;

async function loadDraftEvents() {
  draftEventsModule ??= await import("@/lib/draft-events");
  return draftEventsModule;
}

test("stageSubjectType maps coach and squad allocation stages", async () => {
  const { stageSubjectType } = await loadDraftEvents();
  assert.equal(stageSubjectType(DraftEventStage.MEN_COACH_ALLOCATION), AllocationSubjectType.COACH);
  assert.equal(stageSubjectType(DraftEventStage.WOMEN_COACH_ALLOCATION), AllocationSubjectType.COACH);
  assert.equal(stageSubjectType(DraftEventStage.MEN_SQUAD_ALLOCATION), AllocationSubjectType.SQUAD);
  assert.equal(stageSubjectType(DraftEventStage.WOMEN_SQUAD_ALLOCATION), AllocationSubjectType.SQUAD);
  assert.equal(stageSubjectType(DraftEventStage.CLUB_REVEAL), null);
});

test("stageGenderHint identifies men and women allocation stages", async () => {
  const { stageGenderHint } = await loadDraftEvents();
  assert.equal(stageGenderHint(DraftEventStage.MEN_SQUAD_ALLOCATION), "men");
  assert.equal(stageGenderHint(DraftEventStage.WOMEN_COACH_ALLOCATION), "women");
  assert.equal(stageGenderHint(DraftEventStage.INTRO), null);
});

test("rehearsal mode does not persist official draft assignments", async () => {
  const { shouldPersistOfficialAllocation } = await loadDraftEvents();
  assert.equal(shouldPersistOfficialAllocation(DraftEventOperatingMode.REHEARSAL), false);
  assert.equal(shouldPersistOfficialAllocation(DraftEventOperatingMode.LIVE), true);
});

test("draft event operation permissions are restricted", () => {
  assert.equal(hasPermission(["SUPER_ADMIN"], "draft-event:correct"), true);
  assert.equal(hasPermission(["LEAGUE_OPERATOR"], "draft-event:operate"), true);
  assert.equal(hasPermission(["LEAGUE_OPERATOR"], "draft-event:correct"), false);
  assert.equal(hasPermission(["COACH"], "draft-event:operate"), false);
  assert.equal(hasPermission(["FAN"], "draft-event:display"), false);
});

test("draft squad readiness treats incomplete groups as warnings", async () => {
  const { classifyDraftSquadReadiness, draftSquadStatusSeverity } = await import("@/lib/draft-squad-capacity");
  assert.equal(classifyDraftSquadReadiness({ currentSize: 5, targetSize: 5 }), "READY");
  assert.equal(classifyDraftSquadReadiness({ currentSize: 2, targetSize: 5 }), "INCOMPLETE");
  assert.equal(draftSquadStatusSeverity("INCOMPLETE"), "AMBER");
  assert.equal(classifyDraftSquadReadiness({ currentSize: 6, targetSize: 5 }), "OVER_CAPACITY");
  assert.equal(draftSquadStatusSeverity("OVER_CAPACITY"), "RED");
  assert.equal(classifyDraftSquadReadiness({ currentSize: 0, targetSize: 5 }), "EMPTY");
});
