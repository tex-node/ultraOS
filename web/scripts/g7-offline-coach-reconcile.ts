import { AllocationStatus, AllocationSubjectType, StaffRole } from "../src/generated/prisma/enums";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const MEN_DIVISION_ID = "cmqfqpnke0003lgkkkgev3oyt";
const WOMEN_DIVISION_ID = "cmqfqpnkl0004lgkkk2bjeqfm";
const APPLY = process.argv.includes("--apply");

const pairings = [
  { coachName: "Olusegun Imah", staffId: "cmqurqfhh0001h3kkc6gfa79i", clubName: "Surge", seasonClubId: "cmqfqpnpm000plgkk6fofe078", divisionId: MEN_DIVISION_ID },
  { coachName: "Christopher Ndifon Ekpe", staffId: "cmrh7mw160006c9kkuii9i0dk", clubName: "Vortex", seasonClubId: "cmqfqpnm20007lgkk0nfwj431", divisionId: MEN_DIVISION_ID },
  { coachName: "Coach David Robinson", staffId: "cmrh7meov0003c9kknsj5pq1r", clubName: "Flux", seasonClubId: "cmqfqpnoz000jlgkkv1i612md", divisionId: MEN_DIVISION_ID },
  { coachName: "Afunku Adeyinka", staffId: "cmsm34n7w00046jkkm8brqy39", clubName: "Apex", seasonClubId: "cmqfqpnod000dlgkku9sqb9nm", divisionId: MEN_DIVISION_ID },
  { coachName: "Adetokunbo Olaosebikan Ijomah", staffId: "cmr0nqyoz0001utkkchz8uj8p", clubName: "Ember", seasonClubId: "cmqfqpnrb0017lgkkm9i40f6u", divisionId: WOMEN_DIVISION_ID },
  { coachName: "Imomoh Kewwe Blessing", staffId: "cmsmlv4dp0005o9kke0kxrlnu", clubName: "Eclipse", seasonClubId: "cmqfqpnrt001dlgkkskzah895", divisionId: WOMEN_DIVISION_ID },
  { coachName: "Udeaja Chioma Priscilla", staffId: "cmsm34grj00016jkkthefvewo", clubName: "Halo", seasonClubId: "cmqfqpnqs0011lgkkg2pvftnj", divisionId: WOMEN_DIVISION_ID },
  { coachName: "Bilqis Adekoya", staffId: "cmr1tyxgt002gutkkor5xxxuh", clubName: "Nova", seasonClubId: "cmqfqpnq6000vlgkk3tyi7n08", divisionId: WOMEN_DIVISION_ID },
];

const REASON = "Coach assignment decided offline during an internet outage on Draft Day. Reconciled into the system by the administrator to match the actual real-world outcome — this was not a randomized online draw.";

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN ===");

  // Pre-flight: confirm every target club and staff member is currently unassigned,
  // and that no duplicate staffId/seasonClubId appears in the pairing list itself.
  const staffIds = pairings.map((p) => p.staffId);
  const clubIds = pairings.map((p) => p.seasonClubId);
  if (new Set(staffIds).size !== staffIds.length) throw new Error("Duplicate coach in pairings.");
  if (new Set(clubIds).size !== clubIds.length) throw new Error("Duplicate club in pairings.");

  const existingClaims = await prisma.draftAllocation.findMany({
    where: { draftEventId: DRAFT_EVENT_ID, subjectType: AllocationSubjectType.COACH, status: { notIn: [AllocationStatus.CANCELLED, AllocationStatus.CORRECTED] } },
  });
  if (existingClaims.length > 0) throw new Error(`Refusing: ${existingClaims.length} non-terminal COACH allocations already exist.`);

  const existingCoachWrites = await prisma.seasonClub!.findMany({ where: { id: { in: clubIds } }, select: { id: true, headCoachId: true, assistantCoachId: true } });
  for (const sc of existingCoachWrites) {
    if (sc.headCoachId || sc.assistantCoachId) throw new Error(`Refusing: SeasonClub ${sc.id} already has a coach on record.`);
  }

  for (const pairing of pairings) {
    const staff = await prisma.staff.findUniqueOrThrow({ where: { id: pairing.staffId }, select: { role: true, name: true } });
    console.log(`${APPLY ? "RECORDING" : "Would record"}: ${pairing.coachName} -> ${pairing.clubName} (${staff.role})`);
    if (!APPLY) continue;

    await prisma.$transaction(async (tx) => {
      // Same class of stale-row collision fixed earlier in reserveNextAllocation():
      // a CORRECTED row from the earlier "still testing" incident can still occupy
      // this staffId/seasonClubId's unique slot. Clearing it is safe — the correction
      // is already permanently recorded in AuditLog.
      await tx.draftAllocation.deleteMany({
        where: {
          draftEventId: DRAFT_EVENT_ID,
          operatingMode: "LIVE",
          subjectType: AllocationSubjectType.COACH,
          status: { in: [AllocationStatus.CANCELLED, AllocationStatus.CORRECTED] },
          OR: [{ staffId: pairing.staffId }, { seasonClubId: pairing.seasonClubId, divisionId: pairing.divisionId }],
        },
      });
      const maxSequence = await tx.draftAllocation.aggregate({
        where: { draftEventId: DRAFT_EVENT_ID, operatingMode: "LIVE", subjectType: AllocationSubjectType.COACH },
        _max: { sequence: true },
      });
      const sequence = (maxSequence._max.sequence ?? 0) + 1;
      const now = new Date();

      const allocation = await tx.draftAllocation.create({
        data: {
          draftEventId: DRAFT_EVENT_ID,
          operatingMode: "LIVE",
          divisionId: pairing.divisionId,
          subjectType: AllocationSubjectType.COACH,
          staffId: pairing.staffId,
          seasonClubId: pairing.seasonClubId,
          sequence,
          status: AllocationStatus.CONFIRMED,
          randomMethod: "OFFLINE_MANUAL_ASSIGNMENT",
          randomSeed: null,
          candidateSnapshot: { note: "Offline assignment during internet outage — not a randomized online draw.", assignedClubId: pairing.seasonClubId },
          reservedAt: now,
          revealedAt: now,
          confirmedAt: now,
          createdById: ACTOR_ID,
          confirmedById: ACTOR_ID,
        },
      });

      const coachData = staff.role === StaffRole.ASSISTANT_COACH ? { assistantCoachId: pairing.staffId } : { headCoachId: pairing.staffId };
      await tx.seasonClub!.update({ where: { id: pairing.seasonClubId }, data: coachData });

      await writeAuditLog(tx, {
        action: "DRAFT_EVENT_ALLOCATION_OFFLINE_RECONCILED",
        details: { allocationId: allocation.id, coachName: pairing.coachName, clubName: pairing.clubName, staffId: pairing.staffId, seasonClubId: pairing.seasonClubId, reason: REASON },
        entityId: allocation.id,
        entityType: "DraftAllocation",
        userId: ACTOR_ID,
      });
    });
  }

  if (APPLY) {
    await prisma.draftEvent.update({ where: { id: DRAFT_EVENT_ID }, data: { displaySequence: { increment: 1 }, publicMessage: "Coach assignments reconciled after offline resolution." } });
  }

  const officialCoachCount = await prisma.seasonClub!.count({ where: { OR: [{ headCoachId: { not: null } }, { assistantCoachId: { not: null } }] } });
  console.log("Official coach assignments now on record:", officialCoachCount, "(expect 8 after apply, 0 on dry run)");
}

main().finally(() => prisma.$disconnect());
