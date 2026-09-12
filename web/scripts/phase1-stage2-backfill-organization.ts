import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const ORG_SLUG = "neon-ultra";
const ORG_NAME = "Neon Ultra Basketball League";

// Every tenant-scoped table from Phase 1 Stage 1 (see that migration's own comment) - exact
// Prisma Client delegate names (verified programmatically against the generated client, not
// hand-typed, since a couple of these don't follow simple lowercase-first-letter casing -
// MVPVote's delegate is `mVPVote`, not `mvpVote`).
//
// There is exactly one existing Organization today, so every row's correct answer is the same
// one id - no FK-chain walking is needed for this one-time initial backfill (that complexity
// only matters once a second real tenant exists to disambiguate between). A future track adding
// a second organization must NOT reuse this script as-is.
const TENANT_SCOPED_MODELS = [
  "competition", "division", "season", "club", "seasonClub", "athlete", "player",
  "athleteAward", "athleteVideo", "trainingSession", "athleteTrainingRecord",
  "athleteTrainingMetric", "athleteMedia", "mediaAsset", "mediaAssetVariant",
  "mediaAssetUsage", "participantDocument", "staff", "draft", "draftPick", "draftEvent",
  "draftSquad", "draftSquadMember", "draftCoachPoolEntry", "draftAllocation",
  "operationalChecklist", "operationalChecklistItem", "incident", "runbook", "runbookTask",
  "operatorMessage", "displayHeartbeat", "rehearsal", "equipment", "eventStaffAssignment",
  "venueZone", "systemSetting", "launchReadinessCheck", "opsTask", "opsNotification",
  "opsDocument", "venue", "event", "eventDebrief", "eventVendorReview", "eventVolunteerReview",
  "announcement", "wellWish", "venueSection", "seatZone", "seatReservation", "ticket",
  "accreditation", "application", "adminOfflineIntake", "publicIdCounter", "publicIdAlias",
  "importJob", "importRow", "vendor", "mediaProfile", "volunteerProfile", "vendorProduct",
  "vendorInventory", "order", "orderItem", "checkIn", "promoCode", "sponsorCampaign",
  "fixture", "fixtureOfficial", "game", "ruleSet", "gameRuleSnapshot", "gamePeriodScore",
  "gameEvent", "gameStarter", "playerStat", "teamStat", "standing", "noveltyTeam",
  "noveltyMatch", "noveltyGame", "noveltyGameEvent", "noveltyPlayerStat", "fanClub",
  "fanMembership", "scoutReport", "mVPVote", "auditLog", "contentTemplate", "contentJob",
  "contentAsset", "gameVideo", "videoTimelineAnchor", "courtCalibration", "visionModel",
  "visionAnalysisRun", "visionTrack", "visionObservation", "visionEventMatch",
  "visionSpatialSummary", "courtSpecification", "visionTrajectoryArtifact",
] as const;

type AnyDelegate = { count: (args: unknown) => Promise<number>; updateMany: (args: unknown) => Promise<{ count: number }> };

function delegate(client: unknown, model: string): AnyDelegate {
  const d = (client as Record<string, unknown>)[model] as AnyDelegate | undefined;
  if (!d || typeof d.count !== "function" || typeof d.updateMany !== "function") {
    throw new Error(`Model "${model}" not found on Prisma client - check spelling against schema.prisma.`);
  }
  return d;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const existingOrg = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });

  if (!apply) {
    console.log("DRY RUN - no writes will be made. Pass --apply to actually backfill.\n");
    console.log(`Target organization: ${ORG_NAME} (slug: ${ORG_SLUG}) - ${existingOrg ? `already exists (${existingOrg.id})` : "would be created"}\n`);
    let totalNull = 0;
    for (const model of TENANT_SCOPED_MODELS) {
      const nullCount = await delegate(prisma, model).count({ where: { organizationId: null } });
      totalNull += nullCount;
      console.log(`${model.padEnd(28)} NULL organizationId rows: ${nullCount}`);
    }
    console.log(`\nTotal rows that would be backfilled: ${totalNull}`);
    return;
  }

  const org = await prisma.$transaction(
    async (tx) => {
      const org = await tx.organization.upsert({
        where: { slug: ORG_SLUG },
        update: {},
        create: { name: ORG_NAME, slug: ORG_SLUG },
      });

      for (const model of TENANT_SCOPED_MODELS) {
        await delegate(tx, model).updateMany({
          where: { organizationId: null },
          data: { organizationId: org.id },
        });
      }

      return org;
    },
    { timeout: 30_000 },
  );

  console.log(`Backfilled all tenant-scoped tables to organization ${org.id} (${org.name}).\n`);

  let remaining = 0;
  for (const model of TENANT_SCOPED_MODELS) {
    const nullCount = await delegate(prisma, model).count({ where: { organizationId: null } });
    if (nullCount > 0) {
      console.error(`WARNING: ${model} still has ${nullCount} NULL organizationId rows after backfill.`);
      remaining += nullCount;
    }
  }
  if (remaining === 0) {
    console.log("Verification passed: zero NULL organizationId rows remain across all tenant-scoped tables.");
  } else {
    console.error(`Verification FAILED: ${remaining} rows still NULL.`);
    process.exitCode = 1;
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
