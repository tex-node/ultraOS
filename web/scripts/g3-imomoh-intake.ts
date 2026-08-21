import { createAdminOfflineIntake, provisionAdminOfflineIntake } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";

async function main() {
  const result = await createAdminOfflineIntake({
    participantType: "COACH",
    fullName: "Imomoh Kewwe Blessing",
    email: "imomohblessing@gmail.com",
    coachSeasonZeroSelectionStatus: "SEASON_ZERO_SELECTED",
    coachSeasonZeroDivision: "WOMEN",
    reason: "Season Zero WOMEN coach cohort — offline recruitment, no public Application on file.",
    createdById: ACTOR_ID,
  });

  if (!result.created) {
    console.log("NOT CREATED — existing identity matches found:", JSON.stringify(result.matches, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log("Intake created:", result.intake.id);
  const provisioned = await provisionAdminOfflineIntake(result.intake.id, ACTOR_ID);
  console.log(JSON.stringify(provisioned, null, 2));
}

main().finally(() => prisma.$disconnect());
