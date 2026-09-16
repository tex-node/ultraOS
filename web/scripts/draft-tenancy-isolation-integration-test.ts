// Phase 1, Stage 5.2B-3: two-tenant staging rehearsal for the draft/tryout/coach-pool
// tenancy hardening. This is a genuine repeatable rehearsal utility, not a historical
// one-off (same category as rehearsal-isolation-integration-test.ts and
// secondary-draft-isolation-integration-test.ts) - run it against `ultraos_staging`
// connected as the restricted `ultraos_staging` role (see
// /opt/ultraleagueos/shared/staging-maintenance.env) so RLS is genuinely exercised, never
// against production. It creates a disposable Organization B, exercises the REAL
// reserveNextAllocation/revealAllocation/confirmAllocation functions from
// src/lib/draft-events.ts (not raw SQL simulation) for both SQUAD and COACH allocation
// types, attempts several cross-org writes that must be denied, verifies zero partial
// writes after each denial, and deletes every row it created (including Organization B
// itself) before exiting. The privileged-role (RLS-bypassing) composite-FK proof is a
// separate, self-contained script: verify-5-2b3-privileged-fk.ts.
import { AllocationSubjectType, AthleteGender, ClubBrandingStatus, ClubStatus, DraftEventOperatingMode, DraftEventStage, DraftEventStatus, DraftSelectionGroup, PlayerStatus, RecordOrigin, SeasonClubStatus, SeasonStatus, StaffRole, UserRole } from "../src/generated/prisma/enums";
import { confirmAllocation, reserveNextAllocation, revealAllocation } from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

const NEON_ULTRA = "cmt4odhgn0000wokk8fbwr6ro";

function report(label: string, ok: boolean, extra?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${extra ? " -> " + extra : ""}`);
}

async function buildOrgHierarchy(orgId: string, tag: string, sportId: string) {
  return withOrganizationContext(orgId, async (tx) => {
    const competition = await tx.competition.create({ data: { organizationId: orgId, sportId, name: `${tag} League`, slug: `${tag.toLowerCase()}-league-${Date.now()}` } });
    const division = await tx.division.create({ data: { organizationId: orgId, competitionId: competition.id, name: `${tag} Division`, slug: `${tag.toLowerCase()}-division-${Date.now()}`, isActive: true } });
    const season = await tx.season.create({ data: { organizationId: orgId, competitionId: competition.id, name: `${tag} Season`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: SeasonStatus.ACTIVE } });
    const club = await tx.club.create({ data: { organizationId: orgId, sportId, name: `${tag} Club`, shortName: tag.toUpperCase().slice(0, 4), status: ClubStatus.ACTIVE, brandingStatus: ClubBrandingStatus.BRANDING_INCOMPLETE } });
    const seasonClub = await tx.seasonClub!.create({ data: { organizationId: orgId, seasonId: season.id, clubId: club.id, divisionId: division.id, status: SeasonClubStatus.ACTIVE } });
    return { competition, division, season, club, seasonClub };
  });
}

async function buildPlayer(orgId: string, seasonId: string, tag: string) {
  return withOrganizationContext(orgId, async (tx) => {
    const user = await prisma.user.create({ data: { email: `rehearsal-5-2b3-${tag}-${Date.now()}@example.test`, name: `Rehearsal ${tag}`, role: UserRole.FAN } });
    const athlete = await tx.athlete.create({ data: { organizationId: orgId, userId: user.id, firstName: "Rehearsal", lastName: tag, gender: AthleteGender.MALE, dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT", recordOrigin: RecordOrigin.APPLICATION } });
    const player = await tx.player.create({ data: { organizationId: orgId, athleteId: athlete.id, seasonId, position: "Guard", heightCm: 190, weightKg: 85, status: PlayerStatus.DRAFT_ELIGIBLE, draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT } });
    return { user, athlete, player };
  });
}

async function buildStaff(orgId: string, tag: string) {
  return withOrganizationContext(orgId, async (tx) => {
    const user = await prisma.user.create({ data: { email: `rehearsal-5-2b3-coach-${tag}-${Date.now()}@example.test`, name: `Rehearsal Coach ${tag}`, role: UserRole.FAN } });
    const staff = await tx.staff.create({ data: { organizationId: orgId, userId: user.id, name: `Rehearsal Coach ${tag}`, role: StaffRole.HEAD_COACH, recordOrigin: RecordOrigin.APPLICATION } });
    return { user, staff };
  });
}

async function main() {
  const neonUltraSport = await withOrganizationContext(NEON_ULTRA, (tx) => tx.sport.findFirstOrThrow());
  const orgB = await prisma.organization.create({ data: { name: "Rehearsal Draft League B", slug: `rehearsal-draft-league-b-${Date.now()}`, idPrefixAthlete: `RDB${Date.now() % 1000}`, idPrefixStaff: `RSB${Date.now() % 1000}` } });
  console.log("Created disposable Organization B:", orgB.id);

  console.log("\n========== Duplicate business vocabulary across orgs (no collision) ==========");
  const hierarchyA = await buildOrgHierarchy(NEON_ULTRA, "RehearsalDup", neonUltraSport.id);
  const hierarchyB = await buildOrgHierarchy(orgB.id, "RehearsalDup", neonUltraSport.id);
  report("Org A and Org B each created identically-named draft-adjacent records with no collision", Boolean(hierarchyA.competition.id && hierarchyB.competition.id && hierarchyA.competition.name === hierarchyB.competition.name));

  const orgBHierarchy = await buildOrgHierarchy(orgB.id, "OrgBDraft", neonUltraSport.id);

  console.log("\n========== Org B SQUAD allocation (real reserve -> reveal -> confirm) ==========");
  const { user: playerUser, player } = await buildPlayer(orgB.id, orgBHierarchy.season.id, "SquadPlayer");
  const draftEventSquad = await withOrganizationContext(orgB.id, (tx) => tx.draftEvent.create({
    data: {
      organizationId: orgB.id,
      name: "Org B Squad Event",
      publicTitle: "Org B Squad Event",
      seasonId: orgBHierarchy.season.id,
      status: DraftEventStatus.LIVE,
      operatingMode: DraftEventOperatingMode.LIVE,
      currentStage: DraftEventStage.MEN_SQUAD_ALLOCATION,
      displayToken: `rehearsal-squad-${Date.now()}`,
      createdById: playerUser.id,
    },
  }));
  const squad = await withOrganizationContext(orgB.id, (tx) => tx.draftSquad.create({
    data: { organizationId: orgB.id, draftEventId: draftEventSquad.id, seasonId: orgBHierarchy.season.id, divisionId: orgBHierarchy.division.id, name: "Org B Squad", sequence: 1 },
  }));
  await withOrganizationContext(orgB.id, (tx) => tx.draftSquadMember.create({ data: { organizationId: orgB.id, draftSquadId: squad.id, playerId: player.id } }));
  report("Org B Player added to Org B DraftSquad", true);

  const squadAllocation = await reserveNextAllocation({ organizationId: orgB.id, draftEventId: draftEventSquad.id, divisionId: orgBHierarchy.division.id, subjectType: AllocationSubjectType.SQUAD, userId: playerUser.id });
  report("reserveNextAllocation (SQUAD) picked the only eligible squad/club", squadAllocation.draftSquadId === squad.id && squadAllocation.seasonClubId === orgBHierarchy.seasonClub!.id);
  await revealAllocation(orgB.id, squadAllocation.id, playerUser.id);
  await confirmAllocation(orgB.id, squadAllocation.id, playerUser.id);
  const confirmedPlayer = await withOrganizationContext(orgB.id, (tx) => tx.player.findUnique({ where: { id: player.id } }));
  report("Org B Squad confirmation -> Org B SeasonClub PASS (Player.seasonClubId/status written)", confirmedPlayer?.seasonClubId === orgBHierarchy.seasonClub!.id && confirmedPlayer?.status === PlayerStatus.DRAFTED);

  console.log("\n========== Org B COACH allocation (real reserve -> reveal -> confirm) ==========");
  const { user: coachUser, staff } = await buildStaff(orgB.id, "Coach1");
  const draftEventCoach = await withOrganizationContext(orgB.id, (tx) => tx.draftEvent.create({
    data: {
      organizationId: orgB.id,
      name: "Org B Coach Event",
      publicTitle: "Org B Coach Event",
      seasonId: orgBHierarchy.season.id,
      status: DraftEventStatus.LIVE,
      operatingMode: DraftEventOperatingMode.LIVE,
      currentStage: DraftEventStage.MEN_COACH_ALLOCATION,
      displayToken: `rehearsal-coach-${Date.now()}`,
      createdById: coachUser.id,
    },
  }));
  await withOrganizationContext(orgB.id, (tx) => tx.draftCoachPoolEntry.create({
    data: { organizationId: orgB.id, draftEventId: draftEventCoach.id, divisionId: orgBHierarchy.division.id, staffId: staff.id, eligibleHeadCoach: true },
  }));
  report("Org B Coach added to Org B Coach Pool", true);

  const coachAllocation = await reserveNextAllocation({ organizationId: orgB.id, draftEventId: draftEventCoach.id, divisionId: orgBHierarchy.division.id, subjectType: AllocationSubjectType.COACH, userId: coachUser.id });
  report("reserveNextAllocation (COACH) picked the only eligible coach/club", coachAllocation.staffId === staff.id && coachAllocation.seasonClubId === orgBHierarchy.seasonClub!.id);
  await revealAllocation(orgB.id, coachAllocation.id, coachUser.id);
  await confirmAllocation(orgB.id, coachAllocation.id, coachUser.id);
  const confirmedClub = await withOrganizationContext(orgB.id, (tx) => tx.seasonClub!.findUnique({ where: { id: orgBHierarchy.seasonClub!.id } }));
  report("Org B Coach confirmation -> Org B SeasonClub PASS (SeasonClub.headCoachId written)", confirmedClub?.headCoachId === staff.id);

  console.log("\n========== Cross-org denial (application level, restricted role, RLS + composite FK) ==========");
  const neonUltraPlayer = await withOrganizationContext(NEON_ULTRA, (tx) => tx.player.findFirst({ orderBy: { createdAt: "asc" } }));
  if (neonUltraPlayer) {
    try {
      await withOrganizationContext(orgB.id, (tx) => tx.draftSquadMember.create({ data: { organizationId: orgB.id, draftSquadId: squad.id, playerId: neonUltraPlayer.id } }));
      report("Org A Player -> Org B DraftSquad denied (composite FK)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org A Player -> Org B DraftSquad denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
  } else {
    report("Org A Player -> Org B DraftSquad denied (composite FK)", false, "NOT_TESTED: no Neon Ultra player found to attempt with");
  }

  const neonUltraStaff = await withOrganizationContext(NEON_ULTRA, (tx) => tx.staff.findFirst({ orderBy: { createdAt: "asc" } }));
  if (neonUltraStaff) {
    // DraftCoachPoolEntry.staffId is NOT composite-FK-hardened this stage (see
    // PHASE1_STAGE5_2B3_DRAFT_TRYOUT_COACH_TENANCY.md), so this replicates
    // addCoachPoolEntry()'s own scoped tx.staff.findUniqueOrThrow() guard exactly - a raw
    // create with no such lookup would succeed regardless of organizationId (this was in fact
    // caught by an earlier run of this rehearsal, which found addCoachPoolEntry() missing this
    // exact check; it has since been fixed in src/app/draft-events/actions.ts).
    try {
      await withOrganizationContext(orgB.id, async (tx) => {
        await tx.staff.findUniqueOrThrow({ where: { id: neonUltraStaff.id }, select: { id: true } });
        return tx.draftCoachPoolEntry.create({ data: { organizationId: orgB.id, draftEventId: draftEventCoach.id, divisionId: orgBHierarchy.division.id, staffId: neonUltraStaff.id } });
      });
      report("Org A Coach -> Org B Coach Pool denied (application-level guard, not a DB constraint)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org A Coach -> Org B Coach Pool denied (application-level guard, not a DB constraint)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
  } else {
    report("Org A Coach -> Org B Coach Pool denied (application-level guard, not a DB constraint)", false, "NOT_TESTED: no Neon Ultra staff found to attempt with");
  }

  const neonUltraSeasonClub = await withOrganizationContext(NEON_ULTRA, (tx) => tx.seasonClub!.findFirst({ orderBy: { createdAt: "asc" } }));
  if (neonUltraSeasonClub) {
    try {
      await withOrganizationContext(orgB.id, (tx) => tx.draftAllocation.create({
        data: { organizationId: orgB.id, draftEventId: draftEventSquad.id, divisionId: orgBHierarchy.division.id, subjectType: AllocationSubjectType.SQUAD, draftSquadId: squad.id, seasonClubId: neonUltraSeasonClub.id, sequence: 999, createdById: playerUser.id },
      }));
      report("Org A SeasonClub -> Org B DraftAllocation denied (composite FK)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org A SeasonClub -> Org B DraftAllocation denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
  } else {
    report("Org A SeasonClub -> Org B DraftAllocation denied (composite FK)", false, "NOT_TESTED: no Neon Ultra SeasonClub found to attempt with");
  }

  const neonUltraDivision = await withOrganizationContext(NEON_ULTRA, (tx) => tx.division.findFirst({ orderBy: { createdAt: "asc" } }));
  if (neonUltraDivision) {
    try {
      await withOrganizationContext(orgB.id, (tx) => tx.draftAllocation.create({
        data: { organizationId: orgB.id, draftEventId: draftEventSquad.id, divisionId: neonUltraDivision.id, subjectType: AllocationSubjectType.SQUAD, draftSquadId: squad.id, seasonClubId: orgBHierarchy.seasonClub!.id, sequence: 998, createdById: playerUser.id },
      }));
      report("Org A Division -> Org B DraftAllocation denied (composite FK)", false, "create succeeded unexpectedly");
    } catch (error) {
      report("Org A Division -> Org B DraftAllocation denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
    }
  } else {
    report("Org A Division -> Org B DraftAllocation denied (composite FK)", false, "NOT_TESTED: no Neon Ultra division found to attempt with");
  }

  const allocationCountAfterFailures = await withOrganizationContext(orgB.id, (tx) => tx.draftAllocation.count({ where: { organizationId: orgB.id, sequence: { in: [999, 998] } } }));
  report("Zero partial writes after failed cross-org DraftAllocation attempts", allocationCountAfterFailures === 0);

  console.log("\n========== Cleanup ==========");
  // AuditLog rows written by reserveNextAllocation/revealAllocation/confirmAllocation/
  // addCoachPoolEntry-equivalent calls above reference playerUser/coachUser via userId - must
  // be deleted before those users, or AuditLog_userId_fkey blocks the user delete below.
  await withOrganizationContext(orgB.id, (tx) => tx.auditLog.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.draftAllocation.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.draftCoachPoolEntry.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.draftSquadMember.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.draftSquad.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.draftEvent.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.player.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.athlete.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.staff.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.seasonClub!.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.club.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.season.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.division.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.competition.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.seasonClub!.deleteMany({ where: { id: hierarchyA.seasonClub!.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.club.deleteMany({ where: { id: hierarchyA.club.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.season.deleteMany({ where: { id: hierarchyA.season.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.division.deleteMany({ where: { id: hierarchyA.division.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.competition.deleteMany({ where: { id: hierarchyA.competition.id } }));
  await prisma.user.deleteMany({ where: { id: { in: [playerUser.id, coachUser.id] } } });
  await prisma.organization.delete({ where: { id: orgB.id } });
  console.log("Cleanup complete - Organization B and every rehearsal row removed.");
}

main()
  .catch((error) => {
    console.error("REHEARSAL FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
