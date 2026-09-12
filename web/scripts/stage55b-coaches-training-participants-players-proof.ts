// Phase 1, Stage 5.5B Batch 5: repeatable Org A / Org B empirical tenant-isolation proof for the
// Coaches / Training / Participants-Offline-Intake / Players-Athlete domain. Run against
// `ultraos_staging`, connected as the restricted `ultraos_staging` role (NOSUPERUSER,
// NOBYPASSRLS) - never against production, never as the privileged `ultraos`/migrate.env role.
//
// Where the real write path is a plain library function that already takes an explicit
// organizationId (admin-offline-intake.ts, entirely converted this batch), this script calls
// those real functions directly - no reimplementation. Where the real write path is a server
// action gated behind requirePermissionWithOrganization() (coaches/actions.ts, training/
// actions.ts, players/actions.ts), it cannot run from a bare script (no NextAuth request
// context) so this script replicates its exact inline Prisma logic - same precedent as every
// prior stage's rehearsal script. Org A and Org B use IDENTICAL business names ("Test Coach",
// "Test Club", "Test Player") on purpose so a pass can never be explained by incidentally-unique
// names. Every deliberately-failing negative test runs in its own transaction/context call.
import { Prisma } from "../src/generated/prisma/client";
import {
  AthleteGender,
  CoachSeasonZeroDivision,
  CoachSeasonZeroSelectionStatus,
  DraftSelectionGroup,
  PlayerStatus,
  SeasonStatus,
  StaffRole,
} from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import {
  createAdminOfflineIntake,
  provisionAdminOfflineIntake,
  provisionPlayerOfflineIntake,
  searchExistingIdentity,
} from "../src/lib/admin-offline-intake";

type ProofRow = { id: string; scenario: string; expected: string; actual: string; result: "PASS" | "FAIL" };
const proofs: ProofRow[] = [];
let seq = 0;
function record(prefix: string, scenario: string, expected: string, ok: boolean, actual: string) {
  seq += 1;
  const id = `${prefix}-${String(seq).padStart(3, "0")}`;
  proofs.push({ id, scenario, expected, actual, result: ok ? "PASS" : "FAIL" });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${scenario} -- expected: ${expected} -- actual: ${actual}`);
  return ok;
}
function isNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

async function main() {
  const roleCheck = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  const restricted = roleCheck[0] && !roleCheck[0].rolsuper && !roleCheck[0].rolbypassrls;
  console.log(`Connected role bypasses RLS: ${restricted ? "NO (restricted, correct)" : "YES -- REFUSING"} (rolsuper=${roleCheck[0]?.rolsuper}, rolbypassrls=${roleCheck[0]?.rolbypassrls})`);
  if (!restricted) {
    console.error("REFUSING TO PROCEED: this proof must run as the restricted role.");
    process.exitCode = 1;
    return;
  }

  const stamp = Date.now();
  const sport = await prisma.sport.findFirstOrThrow();
  const actor = await prisma.user.create({ data: { email: `stage55b-batch5-actor-${stamp}@example.test`, name: "Batch 5 Proof Actor", role: "SUPER_ADMIN" } });

  async function buildOrg(tag: "A" | "B") {
    const org = await prisma.organization.create({
      data: {
        name: `Stage 5.5B Batch 5 Proof ${tag}`,
        slug: `stage55b-batch5-${tag.toLowerCase()}-${stamp}`,
        idPrefixAthlete: `${tag}A${stamp % 1000}`,
        idPrefixStaff: `${tag}S${stamp % 1000}`,
      },
    });
    return withOrganizationContext(org.id, async (tx) => {
      const competition = await tx.competition.create({ data: { organizationId: org.id, sportId: sport.id, name: `${tag} League`, slug: `${tag.toLowerCase()}-league-${stamp}` } });
      const division = await tx.division.create({ data: { organizationId: org.id, competitionId: competition.id, name: `${tag} Division`, slug: `${tag.toLowerCase()}-division-${stamp}`, isActive: true } });
      const season = await tx.season.create({ data: { organizationId: org.id, competitionId: competition.id, name: `${tag} Season`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: SeasonStatus.ACTIVE } });
      const club = await tx.club.create({ data: { organizationId: org.id, sportId: sport.id, name: "Test Club", shortName: `T${tag}C`, status: "ACTIVE", brandingStatus: "BRANDING_INCOMPLETE" } });
      const seasonClub = await tx.seasonClub.create({ data: { organizationId: org.id, seasonId: season.id, clubId: club.id, divisionId: division.id, status: "ACTIVE" } });
      const coach = await tx.staff.create({ data: { organizationId: org.id, name: "Test Coach", role: StaffRole.HEAD_COACH, ultraStaffId: `T${tag}S-${stamp}` } });
      const athlete = await tx.athlete.create({
        data: {
          organizationId: org.id,
          firstName: "Test",
          lastName: "Player",
          gender: AthleteGender.MALE,
          dateOfBirth: new Date("2000-01-01"),
          dominantHand: "RIGHT",
          ultraAthleteId: `T${tag}A-${stamp}`,
        },
      });
      const player = await tx.player.create({ data: { organizationId: org.id, athleteId: athlete.id, seasonId: season.id, position: "Guard", heightCm: 190, weightKg: 85, status: PlayerStatus.DRAFT_ELIGIBLE, draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT } });
      return { org, competition, division, season, club, seasonClub, coach, athlete, player };
    });
  }

  console.log("\n========== Fixture setup (Org A, Org B; colliding names by design) ==========");
  const a = await buildOrg("A");
  const b = await buildOrg("B");
  console.log(`Org A: ${a.org.id}  Org B: ${b.org.id}  Coach A: ${a.coach.id}  Athlete A: ${a.athlete.id}`);

  // ============================== COACHES ==============================
  console.log("\n========== COACHES: assignSeasonClubCoach/clearSeasonClubCoach logic (coaches/actions.ts) ==========");
  async function assignSeasonClubCoachAs(orgId: string, seasonClubId: string, staffId: string) {
    return withOrganizationContext(orgId, async (tx) => {
      const [seasonClub, staff] = await Promise.all([
        tx.seasonClub.findUniqueOrThrow({ where: { id: seasonClubId }, select: { id: true, divisionId: true, seasonId: true } }),
        tx.staff.findUniqueOrThrow({ where: { id: staffId }, select: { id: true, role: true } }),
      ]);
      return tx.seasonClub.update({ where: { id: seasonClub.id }, data: { headCoachId: staff.id } });
    });
  }
  const orgAAssign = await assignSeasonClubCoachAs(a.org.id, a.seasonClub.id, a.coach.id);
  record("COACH", "Org A assigns its own coach to its own SeasonClub", "PASS", orgAAssign.headCoachId === a.coach.id, JSON.stringify({ headCoachId: orgAAssign.headCoachId === a.coach.id }));
  try {
    await assignSeasonClubCoachAs(b.org.id, a.seasonClub.id, a.coach.id);
    record("COACH", "Org B assigns Org A's coach to Org A's SeasonClub (forged cross-tenant assignment)", "denied (not found)", false, "unexpectedly succeeded");
  } catch (error) {
    record("COACH", "Org B assigns Org A's coach to Org A's SeasonClub (forged cross-tenant assignment)", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
  }
  try {
    await assignSeasonClubCoachAs(b.org.id, b.seasonClub.id, a.coach.id);
    record("COACH", "Org B assigns Org A's coach to Org B's own SeasonClub", "denied (not found)", false, "unexpectedly succeeded");
  } catch (error) {
    record("COACH", "Org B assigns Org A's coach to Org B's own SeasonClub", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
  }

  console.log("\n========== COACHES: read isolation (coaches/[ultraStaffId]/page.tsx logic) ==========");
  const orgAReadsOwnCoach = await withOrganizationContext(a.org.id, (tx) => tx.staff.findFirst({ where: { id: a.coach.id } }));
  record("COACH", "Org A reads its own coach profile", "found", Boolean(orgAReadsOwnCoach), JSON.stringify({ found: Boolean(orgAReadsOwnCoach) }));
  const orgBReadsOrgACoach = await withOrganizationContext(b.org.id, (tx) => tx.staff.findFirst({ where: { id: a.coach.id } }));
  record("COACH", "Org B reads Org A's coach profile by real id", "denied (null)", orgBReadsOrgACoach === null, JSON.stringify(orgBReadsOrgACoach));

  console.log("\n========== COACHES: photo-import ultraStaffId match scoping (coaches/actions.ts) ==========");
  const orgBMatchesOrgACoachByUltraId = await withOrganizationContext(b.org.id, (tx) => tx.staff.findMany({ where: { ultraStaffId: { in: [a.coach.ultraStaffId!] } } }));
  record("COACH", "Org B's photo-import match search for Org A's real ultraStaffId", "0 matches (excluded, not a leak - ultraStaffId is globally unique)", orgBMatchesOrgACoachByUltraId.length === 0, `matches=${orgBMatchesOrgACoachByUltraId.length}`);
  const orgAMatchesOwnCoachByUltraId = await withOrganizationContext(a.org.id, (tx) => tx.staff.findMany({ where: { ultraStaffId: { in: [a.coach.ultraStaffId!] } } }));
  record("COACH", "Org A's photo-import match search for its own real ultraStaffId", "1 match", orgAMatchesOwnCoachByUltraId.length === 1, `matches=${orgAMatchesOwnCoachByUltraId.length}`);

  console.log("\n========== COACHES: Season Zero coach selection scoping (coaches/actions.ts markSeasonZeroCoachSelection) ==========");
  const coachApplicationA = await withOrganizationContext(a.org.id, (tx) =>
    tx.application.create({ data: { organizationId: a.org.id, type: "COACH", status: "APPROVED", applicantUserId: null, submittedData: { fullName: "Test Coach" }, provisionedStaffId: a.coach.id } }),
  );
  async function markSeasonZeroCoachSelectionAs(orgId: string, applicationId: string, status: CoachSeasonZeroSelectionStatus, division: CoachSeasonZeroDivision | null) {
    return withOrganizationContext(orgId, async (tx) => {
      const application = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, select: { id: true, type: true } });
      if (application.type !== "COACH") throw new Error("Only coach applications can be marked.");
      return tx.application.update({ where: { id: applicationId }, data: { coachSeasonZeroSelectionStatus: status, coachSeasonZeroDivision: division } });
    });
  }
  const orgASelectsOwnCoach = await markSeasonZeroCoachSelectionAs(a.org.id, coachApplicationA.id, CoachSeasonZeroSelectionStatus.SEASON_ZERO_SELECTED, CoachSeasonZeroDivision.MEN);
  record("COACH", "Org A marks its own coach application SEASON_ZERO_SELECTED", "PASS", orgASelectsOwnCoach.coachSeasonZeroSelectionStatus === "SEASON_ZERO_SELECTED", orgASelectsOwnCoach.coachSeasonZeroSelectionStatus);
  try {
    await markSeasonZeroCoachSelectionAs(b.org.id, coachApplicationA.id, CoachSeasonZeroSelectionStatus.SEASON_ZERO_SELECTED, CoachSeasonZeroDivision.WOMEN);
    record("COACH", "Org B marks Org A's coach application for Season Zero selection", "denied (not found)", false, "unexpectedly succeeded");
  } catch (error) {
    record("COACH", "Org B marks Org A's coach application for Season Zero selection", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
  }
  const orgAApplicationAfterAttack = await withOrganizationContext(a.org.id, (tx) => tx.application.findUniqueOrThrow({ where: { id: coachApplicationA.id } }));
  record("COACH", "Org A's application state after Org B's failed selection attempt", "unchanged (still MEN)", orgAApplicationAfterAttack.coachSeasonZeroDivision === "MEN", String(orgAApplicationAfterAttack.coachSeasonZeroDivision));

  // ============================== TRAINING ==============================
  console.log("\n========== TRAINING: createTrainingSession/recordTrainingAttendance logic (training/actions.ts) ==========");
  async function createTrainingSessionAs(orgId: string, seasonId: string, seasonClubId: string) {
    return withOrganizationContext(orgId, async (tx) => {
      await tx.season.findUniqueOrThrow({ where: { id: seasonId }, select: { id: true } });
      await tx.seasonClub.findUniqueOrThrow({ where: { id: seasonClubId }, select: { id: true } });
      return tx.trainingSession.create({ data: { organizationId: orgId, createdById: actor.id, title: "Test Session", sessionType: "TEAM_PRACTICE", occurredAt: new Date(), seasonId, seasonClubId } });
    });
  }
  const trainingA = await createTrainingSessionAs(a.org.id, a.season.id, a.seasonClub.id);
  record("TRN", "Org A creates its own training session", "PASS", Boolean(trainingA.id), JSON.stringify({ id: Boolean(trainingA.id) }));
  try {
    await createTrainingSessionAs(b.org.id, a.season.id, a.seasonClub.id);
    record("TRN", "Org B creates a training session using Org A's seasonId/seasonClubId", "denied (not found)", false, "unexpectedly succeeded");
  } catch (error) {
    record("TRN", "Org B creates a training session using Org A's seasonId/seasonClubId", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
  }

  async function recordTrainingAttendanceAs(orgId: string, trainingSessionId: string, athleteId: string) {
    return withOrganizationContext(orgId, async (tx) => {
      await tx.trainingSession.findUniqueOrThrow({ where: { id: trainingSessionId }, select: { id: true } });
      await tx.athlete.findUniqueOrThrow({ where: { id: athleteId }, select: { id: true } });
      return tx.athleteTrainingRecord.upsert({
        where: { trainingSessionId_athleteId: { trainingSessionId, athleteId } },
        update: { attendanceStatus: "PRESENT" },
        create: { organizationId: orgId, trainingSessionId, athleteId, attendanceStatus: "PRESENT", createdById: actor.id },
      });
    });
  }
  const attendanceA = await recordTrainingAttendanceAs(a.org.id, trainingA.id, a.athlete.id);
  record("TRN", "Org A records attendance for its own athlete/session", "PASS", Boolean(attendanceA.id), JSON.stringify({ id: Boolean(attendanceA.id) }));
  try {
    await recordTrainingAttendanceAs(b.org.id, trainingA.id, a.athlete.id);
    record("TRN", "Org B records attendance using Org A's trainingSessionId/athleteId", "denied (not found)", false, "unexpectedly succeeded");
  } catch (error) {
    record("TRN", "Org B records attendance using Org A's trainingSessionId/athleteId", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
  }
  try {
    await recordTrainingAttendanceAs(b.org.id, trainingA.id, b.athlete.id);
    record("TRN", "Org B records attendance for its own athlete against Org A's session", "denied (not found)", false, "unexpectedly succeeded");
  } catch (error) {
    record("TRN", "Org B records attendance for its own athlete against Org A's session", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
  }

  console.log("\n========== TRAINING: read isolation (training/[sessionId]/page.tsx logic) ==========");
  const orgBReadsOrgATraining = await withOrganizationContext(b.org.id, (tx) => tx.trainingSession.findUnique({ where: { id: trainingA.id } }));
  record("TRN", "Org B reads Org A's training session by real id", "denied (null)", orgBReadsOrgATraining === null, JSON.stringify(orgBReadsOrgATraining));

  console.log("\n========== TRAINING: platform-global TrainingMetricDefinition remains accessible ==========");
  const metricDef = await prisma.trainingMetricDefinition.upsert({
    where: { key: `stage55b-batch5-metric-${stamp}` },
    update: {},
    create: { key: `stage55b-batch5-metric-${stamp}`, name: "Proof Metric", valueType: "NUMERIC" },
  });
  const visibleFromA = await withOrganizationContext(a.org.id, (tx) => tx.trainingMetricDefinition.findUnique({ where: { id: metricDef.id } }));
  const visibleFromB = await withOrganizationContext(b.org.id, (tx) => tx.trainingMetricDefinition.findUnique({ where: { id: metricDef.id } }));
  record("TRN", "Platform-global TrainingMetricDefinition visible under Org A context", "found (genuinely global, not tenant-owned)", Boolean(visibleFromA), JSON.stringify({ found: Boolean(visibleFromA) }));
  record("TRN", "Platform-global TrainingMetricDefinition visible under Org B context", "found (genuinely global, not tenant-owned)", Boolean(visibleFromB), JSON.stringify({ found: Boolean(visibleFromB) }));

  // ============================== PARTICIPANTS / OFFLINE INTAKE ==============================
  console.log("\n========== PARTICIPANTS/OFFLINE-INTAKE: real createAdminOfflineIntake/searchExistingIdentity/provision* functions ==========");
  const intakeAResult = await createAdminOfflineIntake(a.org.id, {
    participantType: "COACH",
    fullName: "Test Coach Intake",
    email: `stage55b-batch5-coach-a-${stamp}@example.test`,
    coachSeasonZeroSelectionStatus: CoachSeasonZeroSelectionStatus.PENDING,
    createdById: actor.id,
  });
  record("PTP", "Org A creates a COACH offline-intake record named 'Test Coach Intake'", "created", intakeAResult.created, JSON.stringify({ created: intakeAResult.created }));
  const intakeBResult = await createAdminOfflineIntake(b.org.id, {
    participantType: "COACH",
    fullName: "Test Coach Intake",
    email: `stage55b-batch5-coach-b-${stamp}@example.test`,
    coachSeasonZeroSelectionStatus: CoachSeasonZeroSelectionStatus.PENDING,
    createdById: actor.id,
  });
  record("PTP", "Org B independently creates an identically-named COACH offline-intake record ('Test Coach Intake')", "created (no false cross-org duplicate match)", intakeBResult.created, JSON.stringify({ created: intakeBResult.created }));

  if (intakeAResult.created) {
    const crossOrgSearch = await withOrganizationContext(b.org.id, (tx) => searchExistingIdentity(tx, { fullName: "Test Coach Intake" }));
    const matchesOrgAIntake = crossOrgSearch.some((match) => match.source === "AdminOfflineIntake" && match.id === intakeAResult.intake.id);
    record("PTP", "Org B's duplicate-identity search for 'Test Coach Intake' does not match Org A's AdminOfflineIntake record", "no match", !matchesOrgAIntake, JSON.stringify({ matchedOrgAIntake: matchesOrgAIntake }));

    try {
      await provisionAdminOfflineIntake(b.org.id, intakeAResult.intake.id, actor.id);
      record("PTP", "Org B provisions Org A's offline-intake record (forged organizationId)", "denied (not found)", false, "unexpectedly succeeded");
    } catch (error) {
      record("PTP", "Org B provisions Org A's offline-intake record (forged organizationId)", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
    }
  }

  const playerIntakeA = await createAdminOfflineIntake(a.org.id, {
    participantType: "PLAYER",
    fullName: "Test Player Two",
    email: `stage55b-batch5-player-a-${stamp}@example.test`,
    playerProfile: { gender: AthleteGender.MALE, dateOfBirth: "2001-01-01", dominantHand: "RIGHT", position: "Guard", heightCm: 188, weightKg: 80 },
    createdById: actor.id,
  });
  if (playerIntakeA.created) {
    const provisioned = await provisionPlayerOfflineIntake(a.org.id, playerIntakeA.intake.id, a.season.id, actor.id);
    if (!provisioned.alreadyProvisioned) {
      record("PTP", "Org A provisions a PLAYER offline-intake record end-to-end", "PASS, Athlete/Player carry Org A's organizationId", provisioned.athlete.organizationId === a.org.id && provisioned.player.organizationId === a.org.id, JSON.stringify({ athleteOrgMatchesA: provisioned.athlete.organizationId === a.org.id, playerOrgMatchesA: provisioned.player.organizationId === a.org.id }));
    }
    try {
      await provisionPlayerOfflineIntake(b.org.id, playerIntakeA.intake.id, b.season.id, actor.id);
      record("PTP", "Org B provisions Org A's PLAYER offline-intake record (forged organizationId + seasonId)", "denied (not found)", false, "unexpectedly succeeded");
    } catch (error) {
      record("PTP", "Org B provisions Org A's PLAYER offline-intake record (forged organizationId + seasonId)", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
    }
  }

  // Atomicity: an incomplete-profile PLAYER intake must never reach the Athlete/Player create.
  const incompleteIntakeA = await createAdminOfflineIntake(a.org.id, {
    participantType: "PLAYER",
    fullName: "Test Incomplete Player",
    email: `stage55b-batch5-incomplete-${stamp}@example.test`,
    createdById: actor.id,
  });
  if (incompleteIntakeA.created) {
    try {
      await provisionPlayerOfflineIntake(a.org.id, incompleteIntakeA.intake.id, a.season.id, actor.id);
      record("PTP", "Provisioning a PLAYER intake with an incomplete profile", "denied (missing fields)", false, "unexpectedly succeeded");
    } catch (error) {
      const denied = error instanceof Error && error.message.startsWith("Cannot provision: missing");
      record("PTP", "Provisioning a PLAYER intake with an incomplete profile", "denied (missing fields)", denied, String((error as Error).message).slice(0, 120));
    }
    const noOrphanAthlete = await withOrganizationContext(a.org.id, (tx) => tx.athlete.count({ where: { email: `stage55b-batch5-incomplete-${stamp}@example.test` } }));
    record("PTP", "No orphan Athlete created after the failed incomplete-profile provisioning attempt", "0", noOrphanAthlete === 0, String(noOrphanAthlete));
  }

  // ============================== PLAYERS / ATHLETE ==============================
  console.log("\n========== PLAYERS/ATHLETE: createAthlete/createPlayer logic (players/actions.ts) ==========");
  async function createAthleteAs(orgId: string, email: string) {
    return withOrganizationContext(orgId, (tx) =>
      tx.athlete.create({ data: { organizationId: orgId, firstName: "Test", lastName: "PlayerTwo", gender: AthleteGender.FEMALE, dateOfBirth: new Date("2002-01-01"), dominantHand: "LEFT", email } }),
    );
  }
  const newAthleteA = await createAthleteAs(a.org.id, `stage55b-batch5-newathlete-a-${stamp}@example.test`);
  const newAthleteB = await createAthleteAs(b.org.id, `stage55b-batch5-newathlete-b-${stamp}@example.test`);
  record("PLR", "Org A and Org B each create an athlete with identical first/last name, independently", "both created, distinct ids", newAthleteA.id !== newAthleteB.id, JSON.stringify({ distinct: newAthleteA.id !== newAthleteB.id }));

  const orgAReadsOwnAthlete = await withOrganizationContext(a.org.id, (tx) => tx.athlete.findFirst({ where: { id: a.athlete.id } }));
  record("PLR", "Org A reads its own athlete", "found", Boolean(orgAReadsOwnAthlete), JSON.stringify({ found: Boolean(orgAReadsOwnAthlete) }));
  const orgBReadsOrgAAthlete = await withOrganizationContext(b.org.id, (tx) => tx.athlete.findFirst({ where: { id: a.athlete.id } }));
  record("PLR", "Org B reads Org A's athlete by real id", "denied (null)", orgBReadsOrgAAthlete === null, JSON.stringify(orgBReadsOrgAAthlete));

  const orgBUpdatesOrgAAthlete = await withOrganizationContext(b.org.id, (tx) => tx.athlete.updateMany({ where: { id: a.athlete.id }, data: { firstName: "Hacked" } }));
  record("PLR", "Org B updates Org A's athlete", "0 rows affected", orgBUpdatesOrgAAthlete.count === 0, JSON.stringify(orgBUpdatesOrgAAthlete));
  const orgAAthleteAfterAttack = await withOrganizationContext(a.org.id, (tx) => tx.athlete.findUniqueOrThrow({ where: { id: a.athlete.id } }));
  record("PLR", "Org A's athlete state after Org B's failed update", "unchanged (still 'Test')", orgAAthleteAfterAttack.firstName === "Test", orgAAthleteAfterAttack.firstName);

  async function validateSeasonClubAs(orgId: string, seasonId: string, seasonClubId: string) {
    return withOrganizationContext(orgId, (tx) => tx.seasonClub.findFirst({ where: { id: seasonClubId, seasonId }, select: { id: true } }));
  }
  const orgAOwnSeasonClubValid = await validateSeasonClubAs(a.org.id, a.season.id, a.seasonClub.id);
  record("PLR", "Org A's own season+seasonClub combination validates", "valid", Boolean(orgAOwnSeasonClubValid), JSON.stringify({ valid: Boolean(orgAOwnSeasonClubValid) }));
  const orgBUsingOrgASeasonClub = await validateSeasonClubAs(b.org.id, a.season.id, a.seasonClub.id);
  record("PLR", "Org B attempts createPlayer with Org A's seasonId+seasonClubId", "invalid (null, RLS-invisible)", orgBUsingOrgASeasonClub === null, JSON.stringify(orgBUsingOrgASeasonClub));

  console.log("\n========== PLAYERS/ATHLETE: photo-import ultraAthleteId match scoping (players/actions.ts) ==========");
  const orgBMatchesOrgAAthleteByUltraId = await withOrganizationContext(b.org.id, (tx) => tx.athlete.findMany({ where: { ultraAthleteId: { in: [a.athlete.ultraAthleteId!] } } }));
  record("PLR", "Org B's photo-import match search for Org A's real ultraAthleteId", "0 matches (excluded, not a leak)", orgBMatchesOrgAAthleteByUltraId.length === 0, `matches=${orgBMatchesOrgAAthleteByUltraId.length}`);

  console.log("\n========== Relational integrity: Player.athleteId is a SIMPLE (non-composite) FK - named, not silently claimed as DB-hardened ==========");
  // Player.athleteId/seasonId are simple FKs, not composite-tenant-hardened (unlike the 18
  // relations hardened since Stage 5.4B). Per established doctrine, Postgres FK validation is
  // not subject to RLS - a raw create bypassing the application guard is expected to SUCCEED at
  // the database level. This is reported honestly as a real, named, un-hardened relation (same
  // backlog category as ~150 other relations platform-wide), not claimed as a DB guarantee.
  const rawForgedPlayer = await withOrganizationContext(b.org.id, (tx) =>
    tx.player.create({ data: { organizationId: b.org.id, athleteId: newAthleteA.id, seasonId: a.season.id, position: "Forward", heightCm: 200, weightKg: 100, status: PlayerStatus.DRAFT_ELIGIBLE, draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT } }),
  );
  record("REL", "DB-level only: raw Player.create with organizationId=B, athleteId=Athlete A, seasonId=Season A (bypassing the app guard)", "SUCCEEDS (Player.athleteId/seasonId are simple, non-composite FKs - a real, named, un-hardened relation, not a regression)", Boolean(rawForgedPlayer.id), JSON.stringify({ created: Boolean(rawForgedPlayer.id), note: "DB_LEVEL_GAP_NAMED_NOT_FIXED_THIS_BATCH" }));
  await withOrganizationContext(b.org.id, (tx) => tx.player.delete({ where: { id: rawForgedPlayer.id } }));

  console.log("\n========== Relational integrity: createPlayer's application-level guard (fixed this batch) ==========");
  async function createPlayerAs(orgId: string, athleteId: string, seasonId: string, seasonClubId: string) {
    return withOrganizationContext(orgId, async (tx) => {
      await tx.athlete.findUniqueOrThrow({ where: { id: athleteId }, select: { id: true } });
      const validScope = await tx.seasonClub.findFirst({ where: { id: seasonClubId, seasonId }, select: { id: true } });
      if (!validScope) throw new Error("INVALID_SCOPE");
      return tx.player.create({ data: { organizationId: orgId, athleteId, seasonId, seasonClubId, position: "Forward", heightCm: 200, weightKg: 100, status: PlayerStatus.DRAFT_ELIGIBLE, draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT } });
    });
  }
  try {
    await createPlayerAs(b.org.id, a.athlete.id, b.season.id, b.seasonClub.id);
    record("REL", "Org B's createPlayer (fixed) with a tampered hidden athleteId naming Athlete A", "denied (not found)", false, "unexpectedly succeeded");
  } catch (error) {
    record("REL", "Org B's createPlayer (fixed) with a tampered hidden athleteId naming Athlete A", "denied (not found)", isNotFound(error), isNotFound(error) ? "P2025, as expected" : String(error).slice(0, 150));
  }
  const legitimatePlayerB = await createPlayerAs(b.org.id, newAthleteB.id, b.season.id, b.seasonClub.id);
  record("REL", "Org B's createPlayer (fixed) with its own real athleteId", "PASS", legitimatePlayerB.organizationId === b.org.id, JSON.stringify({ organizationId: legitimatePlayerB.organizationId === b.org.id }));

  // ============================== CLEANUP ==============================
  console.log("\n========== Cleanup ==========");
  for (const org of [a, b]) {
    await withOrganizationContext(org.org.id, async (tx) => {
      await tx.auditLog.deleteMany({ where: { organizationId: org.org.id } });
      await tx.athleteTrainingRecord.deleteMany({ where: { organizationId: org.org.id } });
      await tx.trainingSession.deleteMany({ where: { organizationId: org.org.id } });
      await tx.player.deleteMany({ where: { organizationId: org.org.id } });
      await tx.athlete.deleteMany({ where: { organizationId: org.org.id } });
      await tx.adminOfflineIntake.deleteMany({ where: { organizationId: org.org.id } });
      await tx.application.deleteMany({ where: { organizationId: org.org.id } });
      await tx.seasonClub.deleteMany({ where: { id: org.seasonClub.id } });
      await tx.staff.deleteMany({ where: { organizationId: org.org.id } });
      await tx.club.deleteMany({ where: { id: org.club.id } });
      await tx.season.deleteMany({ where: { id: org.season.id } });
      await tx.division.deleteMany({ where: { id: org.division.id } });
      await tx.competition.deleteMany({ where: { id: org.competition.id } });
      await tx.publicIdCounter.deleteMany({ where: { organizationId: org.org.id } });
      await tx.publicResourceLocator.deleteMany({ where: { organizationId: org.org.id } });
      await tx.publicTokenLocator.deleteMany({ where: { organizationId: org.org.id } });
    });
    await prisma.organization.delete({ where: { id: org.org.id } });
  }
  await prisma.trainingMetricDefinition.delete({ where: { id: metricDef.id } });
  await prisma.user.delete({ where: { id: actor.id } });

  const residueOrgs = await prisma.organization.count({ where: { slug: { startsWith: "stage55b-batch5-" } } });
  const residueUsers = await prisma.user.count({ where: { email: { startsWith: "stage55b-batch5-" } } });
  record("CLN", "Residue: disposable Organizations remaining", "0", residueOrgs === 0, String(residueOrgs));
  record("CLN", "Residue: disposable Users remaining", "0", residueUsers === 0, String(residueUsers));

  console.log("\n========== SUMMARY ==========");
  const failed = proofs.filter((p) => p.result === "FAIL");
  console.log(`${proofs.length} proofs run, ${proofs.length - failed.length} PASS, ${failed.length} FAIL`);
  if (failed.length) {
    console.log("FAILED:", failed.map((p) => p.id).join(", "));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("PROOF SCRIPT ERROR:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
