// Phase 1, Stage 5.2C: database-level proof that both new composite foreign keys added in
// migration 20260905120000_phase1_stage5_2c_gamevideo_tenant_fk (GameVideo.fixtureId,
// GameVideo.mediaAssetId) reject a cross-organization relation on their own - independent of
// Row Level Security - by attempting each write as the PRIVILEGED role (bypasses RLS entirely:
// rolsuper/rolbypassrls both true) inside a transaction that is always rolled back, win or lose.
// Each relation gets its own fresh setup + negative test in its own transaction, so one
// rejection doesn't prevent testing the rest. Nothing this script does is ever committed.
//
// Run against `ultraos_staging` connected as the privileged `ultraos` role (same role/password
// as production's migrate.env, this database is just ultraos_staging instead of
// ultraleagueos) - never run this against production.
import {
  ClubBrandingStatus, ClubStatus, FixtureStatus, MediaAssetPurpose, MediaStorageProvider,
  RecordOrigin, SeasonClubStatus, SeasonStatus,
} from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";

async function buildOrgBFixtureRig(tx: Prisma.TransactionClient) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const orgB = await tx.organization.create({ data: { name: "Privileged Vision FK Proof Org B", slug: `privileged-vision-fk-proof-org-b-${Date.now()}-${rand}`, idPrefixAthlete: `A${rand}`, idPrefixStaff: `S${rand}` } });
  const sport = await tx.sport.findFirstOrThrow();
  const competition = await tx.competition.create({ data: { organizationId: orgB.id, sportId: sport.id, name: "Privileged Vision Proof League", slug: `privileged-vision-proof-league-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
  const division = await tx.division.create({ data: { organizationId: orgB.id, competitionId: competition.id, name: "Privileged Vision Proof Division", slug: `privileged-vision-proof-division-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, isActive: true } });
  const season = await tx.season.create({ data: { organizationId: orgB.id, competitionId: competition.id, name: "Privileged Vision Proof Season", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: SeasonStatus.ACTIVE } });
  const venue = await tx.venue.create({ data: { organizationId: orgB.id, name: "Privileged Vision Proof Venue", address: "1 Proof Way", city: "Lagos", capacity: 500 } });
  const homeClub = await tx.club.create({ data: { organizationId: orgB.id, sportId: sport.id, name: "Privileged Vision Proof Home Club", shortName: "PVPH", status: ClubStatus.ACTIVE, brandingStatus: ClubBrandingStatus.BRANDING_INCOMPLETE } });
  const awayClub = await tx.club.create({ data: { organizationId: orgB.id, sportId: sport.id, name: "Privileged Vision Proof Away Club", shortName: "PVPA", status: ClubStatus.ACTIVE, brandingStatus: ClubBrandingStatus.BRANDING_INCOMPLETE } });
  const homeSeasonClub = await tx.seasonClub!.create({ data: { organizationId: orgB.id, seasonId: season.id, clubId: homeClub.id, divisionId: division.id, status: SeasonClubStatus.ACTIVE } });
  const awaySeasonClub = await tx.seasonClub!.create({ data: { organizationId: orgB.id, seasonId: season.id, clubId: awayClub.id, divisionId: division.id, status: SeasonClubStatus.ACTIVE } });
  const fixture = await tx.fixture.create({
    data: { organizationId: orgB.id, seasonId: season.id, divisionId: division.id, homeSeasonClubId: homeSeasonClub.id, awaySeasonClubId: awaySeasonClub.id, scheduledAt: new Date("2026-06-01T18:00:00Z"), venueId: venue.id, status: FixtureStatus.SCHEDULED, recordOrigin: RecordOrigin.PRODUCTION },
  });
  const user = await tx.user.create({ data: { email: `privileged-vision-proof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`, name: "Privileged Vision Proof", role: "FAN" } });
  const asset = await tx.mediaAsset.create({
    data: { organizationId: orgB.id, storageProvider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE, objectKey: `privileged-proof/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp4`, mimeType: "video/mp4", byteSize: 1024, checksumSha256: `privileged-proof-${Date.now()}`, purpose: MediaAssetPurpose.GAME_VIDEO, uploadedById: user.id },
  });
  return { orgB, fixture, asset, userId: user.id };
}

type Attempt = { relation: string; constraintName: string; run: (tx: Prisma.TransactionClient) => Promise<unknown> };

async function main() {
  const roleCheck = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  const privileged = roleCheck[0]?.rolsuper && roleCheck[0]?.rolbypassrls;
  console.log(`Connected role bypasses RLS: ${privileged ? "YES" : "NO"} (rolsuper=${roleCheck[0]?.rolsuper}, rolbypassrls=${roleCheck[0]?.rolbypassrls})`);
  if (!privileged) {
    console.error("REFUSING TO PROCEED: this script must be run as the privileged, RLS-bypassing role - a restricted role would make this proof meaningless.");
    process.exitCode = 1;
    return;
  }

  const neonUltraFixture = await prisma.fixture.findFirst({ orderBy: { createdAt: "asc" } });
  const neonUltraAsset = await prisma.mediaAsset.findFirst({ orderBy: { createdAt: "asc" } });

  const attempts: Attempt[] = [];
  if (neonUltraFixture) {
    attempts.push({
      relation: "GameVideo.fixtureId",
      constraintName: "GameVideo_organizationId_fixtureId_fkey",
      run: async (tx) => {
        const f = await buildOrgBFixtureRig(tx);
        return tx.gameVideo.create({ data: { organizationId: f.orgB.id, fixtureId: neonUltraFixture.id, mediaAssetId: f.asset.id, sourceType: "FULL_GAME", registeredById: f.userId } });
      },
    });
  }
  if (neonUltraAsset) {
    attempts.push({
      relation: "GameVideo.mediaAssetId",
      constraintName: "GameVideo_organizationId_mediaAssetId_fkey",
      run: async (tx) => {
        const f = await buildOrgBFixtureRig(tx);
        return tx.gameVideo.create({ data: { organizationId: f.orgB.id, fixtureId: f.fixture.id, mediaAssetId: neonUltraAsset.id, sourceType: "FULL_GAME", registeredById: f.userId } });
      },
    });
  }

  console.log(`\n${attempts.length} relation(s) to test.\n`);
  let allPassed = true;
  for (const attempt of attempts) {
    let rejected = false;
    let message = "";
    try {
      await prisma.$transaction(async (tx) => {
        await attempt.run(tx);
        throw new Error("UNEXPECTED_SUCCESS");
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      rejected = message.includes(attempt.constraintName);
    }
    if (message.startsWith("UNEXPECTED_SUCCESS")) {
      console.log(`FAIL: ${attempt.relation} - cross-org create succeeded under the privileged role.`);
      allPassed = false;
    } else if (rejected) {
      console.log(`PASS: ${attempt.relation} rejected by ${attempt.constraintName} under the privileged, RLS-bypassing role.`);
    } else {
      console.log(`INCONCLUSIVE: ${attempt.relation} - transaction failed, but not on the expected constraint: ${message.split("\n").pop()}`);
      allPassed = false;
    }
  }

  console.log(`\nEvery setup + negative test transaction above was rolled back - nothing was committed.`);
  console.log(allPassed ? "\nOVERALL: PASS - both composite FKs rejected cross-org writes independently of RLS." : "\nOVERALL: NOT ALL PASSED - see above.");

  const residualOrgs = await prisma.organization.count({ where: { slug: { startsWith: "privileged-vision-fk-proof-org-b-" } } });
  console.log(`\nResidue check: ${residualOrgs} leftover "Privileged Vision FK Proof Org B" rows (expect 0, since every transaction rolled back).`);
}

main()
  .catch((error) => {
    console.error("SCRIPT FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
