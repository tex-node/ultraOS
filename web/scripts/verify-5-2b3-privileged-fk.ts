// Phase 1, Stage 5.2B-3: database-level proof that all 5 composite foreign keys added in
// migration 20260904060000_phase1_stage5_2b3_draft_tenant_fk reject a cross-organization
// relation on their own - independent of Row Level Security - by attempting each write as
// the PRIVILEGED role (bypasses RLS entirely: rolsuper/rolbypassrls both true) inside a
// transaction that is always rolled back, win or lose. Each of the 5 relations
// (DraftAllocation.draftEventId/divisionId/seasonClubId, DraftSquadMember.draftSquadId/
// playerId) gets its own fresh setup + negative test in its own transaction, so one
// rejection doesn't prevent testing the rest. Nothing this script does is ever committed.
//
// Run against `ultraos_staging` connected as the privileged `ultraos` role (same role/
// password as production's migrate.env, this database is just ultraos_staging instead of
// ultraleagueos) - never run this against production.
import { AllocationSubjectType, AthleteGender, ClubBrandingStatus, ClubStatus, DraftEventOperatingMode, DraftEventStage, DraftEventStatus, DraftSelectionGroup, PlayerStatus, RecordOrigin, SeasonClubStatus, SeasonStatus } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";

async function buildOrgBFixture(tx: Prisma.TransactionClient) {
  const orgB = await tx.organization.create({ data: { name: "Privileged FK Proof Org B", slug: `privileged-fk-proof-org-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, idPrefixAthlete: `PA${Date.now() % 10000}`, idPrefixStaff: `PS${Date.now() % 10000}` } });
  const sport = await tx.sport.findFirstOrThrow();
  const competition = await tx.competition.create({ data: { organizationId: orgB.id, sportId: sport.id, name: "Privileged Proof League", slug: `privileged-proof-league-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
  const division = await tx.division.create({ data: { organizationId: orgB.id, competitionId: competition.id, name: "Privileged Proof Division", slug: `privileged-proof-division-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, isActive: true } });
  const season = await tx.season.create({ data: { organizationId: orgB.id, competitionId: competition.id, name: "Privileged Proof Season", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: SeasonStatus.ACTIVE } });
  const club = await tx.club.create({ data: { organizationId: orgB.id, sportId: sport.id, name: "Privileged Proof Club", shortName: "PPC", status: ClubStatus.ACTIVE, brandingStatus: ClubBrandingStatus.BRANDING_INCOMPLETE } });
  const seasonClub = await tx.seasonClub.create({ data: { organizationId: orgB.id, seasonId: season.id, clubId: club.id, divisionId: division.id, status: SeasonClubStatus.ACTIVE } });
  const user = await tx.user.create({ data: { email: `privileged-proof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`, name: "Privileged Proof", role: "FAN" } });
  const draftEvent = await tx.draftEvent.create({ data: { organizationId: orgB.id, name: "Privileged Proof Event", publicTitle: "Privileged Proof Event", seasonId: season.id, status: DraftEventStatus.LIVE, operatingMode: DraftEventOperatingMode.LIVE, currentStage: DraftEventStage.MEN_SQUAD_ALLOCATION, displayToken: `privileged-proof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdById: user.id } });
  const squad = await tx.draftSquad.create({ data: { organizationId: orgB.id, draftEventId: draftEvent.id, seasonId: season.id, divisionId: division.id, name: "Privileged Proof Squad", sequence: 1 } });
  const athlete = await tx.athlete.create({ data: { organizationId: orgB.id, userId: user.id, firstName: "Privileged", lastName: "Proof", gender: AthleteGender.MALE, dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT", recordOrigin: RecordOrigin.APPLICATION } });
  const player = await tx.player.create({ data: { organizationId: orgB.id, athleteId: athlete.id, seasonId: season.id, position: "Guard", heightCm: 190, weightKg: 85, status: PlayerStatus.DRAFT_ELIGIBLE, draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT } });
  return { orgB, division, season, seasonClub, draftEvent, squad, player, userId: user.id };
}

type Attempt = {
  relation: string;
  constraintName: string;
  run: (tx: Prisma.TransactionClient) => Promise<unknown>;
};

async function main() {
  const roleCheck = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  const privileged = roleCheck[0]?.rolsuper && roleCheck[0]?.rolbypassrls;
  console.log(`Connected role bypasses RLS: ${privileged ? "YES" : "NO"} (rolsuper=${roleCheck[0]?.rolsuper}, rolbypassrls=${roleCheck[0]?.rolbypassrls})`);
  if (!privileged) {
    console.error("REFUSING TO PROCEED: this script must be run as the privileged, RLS-bypassing role - a restricted role would make this proof meaningless.");
    process.exitCode = 1;
    return;
  }

  const neonUltraSeasonClub = await prisma.seasonClub.findFirst({ orderBy: { createdAt: "asc" } });
  const neonUltraDivision = await prisma.division.findFirst({ orderBy: { createdAt: "asc" } });
  const neonUltraDraftEvent = await prisma.draftEvent.findFirst({ orderBy: { createdAt: "asc" } });
  const neonUltraDraftSquad = await prisma.draftSquad.findFirst({ orderBy: { createdAt: "asc" } });
  const neonUltraPlayer = await prisma.player.findFirst({ orderBy: { createdAt: "asc" } });

  const attempts: Attempt[] = [];

  if (neonUltraSeasonClub) {
    attempts.push({
      relation: "DraftAllocation.seasonClubId",
      constraintName: "DraftAllocation_organizationId_seasonClubId_fkey",
      run: async (tx) => {
        const f = await buildOrgBFixture(tx);
        return tx.draftAllocation.create({ data: { organizationId: f.orgB.id, draftEventId: f.draftEvent.id, divisionId: f.division.id, subjectType: AllocationSubjectType.SQUAD, draftSquadId: f.squad.id, seasonClubId: neonUltraSeasonClub.id, sequence: 1, createdById: f.userId } });
      },
    });
  }
  if (neonUltraDivision) {
    attempts.push({
      relation: "DraftAllocation.divisionId",
      constraintName: "DraftAllocation_organizationId_divisionId_fkey",
      run: async (tx) => {
        const f = await buildOrgBFixture(tx);
        return tx.draftAllocation.create({ data: { organizationId: f.orgB.id, draftEventId: f.draftEvent.id, divisionId: neonUltraDivision.id, subjectType: AllocationSubjectType.SQUAD, draftSquadId: f.squad.id, seasonClubId: f.seasonClub.id, sequence: 1, createdById: f.userId } });
      },
    });
  }
  if (neonUltraDraftEvent) {
    attempts.push({
      relation: "DraftAllocation.draftEventId",
      constraintName: "DraftAllocation_organizationId_draftEventId_fkey",
      run: async (tx) => {
        const f = await buildOrgBFixture(tx);
        return tx.draftAllocation.create({ data: { organizationId: f.orgB.id, draftEventId: neonUltraDraftEvent.id, divisionId: f.division.id, subjectType: AllocationSubjectType.SQUAD, draftSquadId: f.squad.id, seasonClubId: f.seasonClub.id, sequence: 1, createdById: f.userId } });
      },
    });
  }
  if (neonUltraDraftSquad) {
    attempts.push({
      relation: "DraftSquadMember.draftSquadId",
      constraintName: "DraftSquadMember_organizationId_draftSquadId_fkey",
      run: async (tx) => {
        const f = await buildOrgBFixture(tx);
        return tx.draftSquadMember.create({ data: { organizationId: f.orgB.id, draftSquadId: neonUltraDraftSquad.id, playerId: f.player.id } });
      },
    });
  }
  if (neonUltraPlayer) {
    attempts.push({
      relation: "DraftSquadMember.playerId",
      constraintName: "DraftSquadMember_organizationId_playerId_fkey",
      run: async (tx) => {
        const f = await buildOrgBFixture(tx);
        return tx.draftSquadMember.create({ data: { organizationId: f.orgB.id, draftSquadId: f.squad.id, playerId: neonUltraPlayer.id } });
      },
    });
  }

  for (const attempt of attempts) {
    let rejectionMessage = "";
    let constraintRejected = false;
    try {
      await prisma.$transaction(async (tx) => {
        await attempt.run(tx);
        throw new Error("UNEXPECTED_SUCCESS");
      });
    } catch (error) {
      rejectionMessage = error instanceof Error ? error.message : String(error);
      constraintRejected = rejectionMessage.includes(attempt.constraintName);
    }
    if (rejectionMessage === "UNEXPECTED_SUCCESS") {
      console.log(`FAIL: ${attempt.relation} - cross-org write under the privileged role succeeded (composite FK did not reject it).`);
    } else if (constraintRejected) {
      console.log(`PASS: ${attempt.relation} - privileged role's cross-org write rejected by ${attempt.constraintName}, not RLS.`);
    } else {
      console.log(`INCONCLUSIVE: ${attempt.relation} - transaction failed, but not on the expected constraint (${attempt.constraintName}). Observed: ${rejectionMessage.split("\n").pop()}`);
    }
  }

  console.log("\nEvery transaction above rolled back on its own thrown error - nothing was committed.");
  const residualOrgs = await prisma.organization.count({ where: { slug: { startsWith: "privileged-fk-proof-org-b-" } } });
  console.log(`Residue check: ${residualOrgs} leftover "Privileged FK Proof Org B" rows (expect 0, since every transaction rolled back).`);
}

main()
  .catch((error) => {
    console.error("SCRIPT FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
