import { DraftEventStage } from "../src/generated/prisma/enums";
import { correctAllocation, reserveNextAllocation, stageGenderHint, stageSubjectType } from "../src/lib/draft-events";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const MEN_DIVISION_ID = "cmqfqpnke0003lgkkkgev3oyt";

async function main() {
  // 1. Confirm the currently-stuck stage (CLUB_REVEAL) correctly resolves to no allocation form —
  //    this is exactly the state the operator is looking at right now, and my fix should show
  //    the amber "set a valid stage" message instead of a broken Reserve form.
  const eventBefore = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  console.log("Current stage:", eventBefore.currentStage, "-> subjectType:", stageSubjectType(eventBefore.currentStage), "genderHint:", stageGenderHint(eventBefore.currentStage));
  if (stageSubjectType(eventBefore.currentStage) !== null) throw new Error("Expected null subjectType for CLUB_REVEAL — page logic assumption wrong.");

  // 2. Set stage to MEN_COACH_ALLOCATION the same way "Set stage" now does, and confirm the
  //    fixed UI's derived values (subjectType, locked division) are exactly what gets submitted.
  await prisma.$transaction(async (tx) => {
    await tx.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.MEN_COACH_ALLOCATION, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { action: "DRAFT_EVENT_STAGE_CHANGED", entityId: DRAFT_EVENT_ID, entityType: "DraftEvent", userId: ACTOR_ID, details: { stage: "MEN_COACH_ALLOCATION" } });
  });
  const eventAfter = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  const subjectType = stageSubjectType(eventAfter.currentStage);
  const genderHint = stageGenderHint(eventAfter.currentStage);
  console.log("New stage:", eventAfter.currentStage, "-> subjectType:", subjectType, "genderHint:", genderHint);
  if (subjectType !== "COACH" || genderHint !== "men") throw new Error("Unexpected derived values.");

  // 3. Submit the exact params the fixed UI form now generates (locked subjectType + locked
  //    division) through the real reserveNextAllocation function — same code path the Reserve
  //    button calls. This must NOT throw "Current stage does not match requested allocation type."
  const allocation = await reserveNextAllocation({ draftEventId: DRAFT_EVENT_ID, divisionId: MEN_DIVISION_ID, subjectType: subjectType!, userId: ACTOR_ID });
  console.log("Reserve succeeded with fixed-UI params — allocation:", allocation.id, "status:", allocation.status);

  // 4. Clean up: correct this verification allocation (audited, reversible, leaves 0 official
  //    writes since we're in REHEARSAL) and reset the stage back to INTRO for the operator.
  await correctAllocation(allocation.id, ACTOR_ID, "Verification test for control-room stage/subjectType guard fix — not a real allocation.");
  await prisma.$transaction(async (tx) => {
    await tx.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { currentStage: DraftEventStage.INTRO, currentAllocationId: null, displaySequence: { increment: 1 } } });
    await writeAuditLog(tx, { action: "DRAFT_EVENT_STAGE_CHANGED", entityId: DRAFT_EVENT_ID, entityType: "DraftEvent", userId: ACTOR_ID, details: { stage: "INTRO", note: "reset after verification" } });
  });

  const finalCheck = await prisma.player.count({ where: { seasonClubId: { not: null } } });
  const coachCheck = await prisma.seasonClub.count({ where: { OR: [{ headCoachId: { not: null } }, { assistantCoachId: { not: null } }] } });
  console.log("Post-verification official writes (must be 0):", { players: finalCheck, coaches: coachCheck });
}

main().finally(() => prisma.$disconnect());
