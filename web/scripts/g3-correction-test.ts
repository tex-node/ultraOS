import { correctAllocation } from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const ALLOCATION_ID = "cmsmoti3r0001zlkk0ulqz54w";

async function main() {
  // Verify reason is required.
  try {
    await correctAllocation("cmt4odhgn0000wokk8fbwr6ro", ALLOCATION_ID, ACTOR_ID, "");
    console.log("FAIL: empty reason was accepted");
  } catch (e) {
    console.log("OK: empty reason rejected —", (e as Error).message);
  }

  await correctAllocation("cmt4odhgn0000wokk8fbwr6ro", ALLOCATION_ID, ACTOR_ID, "Rehearsal correction test before Draft Day — verifying correction mechanism.");

  const allocation = await prisma.draftAllocation.findUniqueOrThrow({ where: { id: ALLOCATION_ID } });
  console.log("Allocation after correction:", JSON.stringify({ status: allocation.status, correctedAt: allocation.correctedAt, correctionReason: allocation.correctionReason }));

  const auditEntry = await prisma.auditLog.findFirst({ where: { action: "DRAFT_EVENT_ALLOCATION_CORRECTED", entityId: ALLOCATION_ID }, orderBy: { createdAt: "desc" } });
  console.log("AuditLog entry:", JSON.stringify(auditEntry));

  const officialWrites = await prisma.seasonClub!.count({ where: { headCoachId: { not: null } } });
  console.log("SeasonClub headCoach assignments after correction (must remain 0):", officialWrites);
}

main().finally(() => prisma.$disconnect());
