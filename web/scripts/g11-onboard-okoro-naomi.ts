import { createAdminOfflineIntake } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

// Phase 1 Stage 5.5B: admin-offline-intake.ts functions now require an explicit
// organizationId - this historical one-off script always meant Neon Ultra.
const NEON_ULTRA_ORGANIZATION_ID = "cmt4odhgn0000wokk8fbwr6ro";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";

async function main() {
  const result = await createAdminOfflineIntake(NEON_ULTRA_ORGANIZATION_ID, {
    createdById: ACTOR_ID,
    fullName: "Okoro Nmesomachukwu Naomi",
    participantType: "PLAYER",
    phone: "07071241944",
    playerProfile: { gender: "FEMALE" },
    reason:
      "Offline-recruited player to help complete an 8-man squad. Distinct from existing Staff record " +
      "cmsm34grj00016jkkthefvewo (Udeaja Chioma Priscilla, HEAD_COACH of Halo) — confirmed by administrator " +
      "to be her daughter, a different real person. Email intentionally left blank until she provides her own; " +
      "the earlier submission had reused her mother's contact details by mistake.",
  });

  if (!result.created) {
    console.log("SKIPPED (still matches an existing identity):", JSON.stringify(result.matches, null, 2));
    return;
  }
  console.log("CREATED:", result.intake.id, result.intake.fullName, result.intake.phone);
}

main().finally(() => prisma.$disconnect());
