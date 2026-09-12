import { updateAdminOfflineIntakePlayerProfile, provisionPlayerOfflineIntake } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

// Phase 1 Stage 5.5B: admin-offline-intake.ts functions now require an explicit
// organizationId - this historical one-off script always meant Neon Ultra.
const NEON_ULTRA_ORGANIZATION_ID = "cmt4odhgn0000wokk8fbwr6ro";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";

function feetInchesToCm(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54);
}

const updates = [
  {
    intakeId: "cmsoqoyk00000gckkt0fj8lec",
    name: "Ada Gift Okechukwu",
    profile: { dateOfBirth: "2009-02-12", dominantHand: "RIGHT", heightCm: feetInchesToCm(6, 4), position: "Power forward", weightKg: 65 },
  },
  {
    intakeId: "cmsoqoykq0002gckkpz2y56tq",
    name: "Precious Favour Johnson",
    profile: { dateOfBirth: "2007-05-18", dominantHand: "RIGHT", heightCm: feetInchesToCm(5, 6), position: "Point guard", weightKg: 54 },
  },
  {
    intakeId: "cmsoqoymj0006gckkbcd26zwz",
    name: "Abigail Effiong Akpan",
    profile: { dateOfBirth: "2008-09-07", dominantHand: "RIGHT", heightCm: feetInchesToCm(5, 10), position: "Shooting guard", weightKg: 54 },
  },
];

async function main() {
  for (const u of updates) {
    const updated = await updateAdminOfflineIntakePlayerProfile(NEON_ULTRA_ORGANIZATION_ID, u.intakeId, u.profile, ACTOR_ID);
    console.log(`${u.name}: profile updated, status=${updated.status}, heightCm=${u.profile.heightCm}`);

    const result = await provisionPlayerOfflineIntake(NEON_ULTRA_ORGANIZATION_ID, u.intakeId, SEASON_ID, ACTOR_ID);
    if (result.alreadyProvisioned) {
      console.log(`${u.name}: already provisioned`);
    } else {
      console.log(`${u.name}: provisioned -> playerId=${result.player.id}, athleteId=${result.athlete.id}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
