import { createAdminOfflineIntake, provisionPlayerOfflineIntake, type PlayerProfile } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

// Phase 1 Stage 5.5B: admin-offline-intake.ts functions now require an explicit
// organizationId - this historical one-off script always meant Neon Ultra.
const NEON_ULTRA_ORGANIZATION_ID = "cmt4odhgn0000wokk8fbwr6ro";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759"; // Season Zero 2026

type NewPlayer = { fullName: string; phone: string; email: string; playerProfile: Required<PlayerProfile> };

const PLAYERS: NewPlayer[] = [
  { fullName: "Beauty Amarachi", phone: "08160294674", email: "chimeziebeauty74@gmail.com", playerProfile: { gender: "FEMALE", dateOfBirth: "2008-05-22", dominantHand: "Right", position: "Point Guard", heightCm: 163, weightKg: 61 } },
  { fullName: "Bankole Emmanuel", phone: "09061435711", email: "romeow753@gmail.com", playerProfile: { gender: "MALE", dateOfBirth: "2009-10-13", dominantHand: "Right", position: "Shooting Guard", heightCm: 183, weightKg: 78 } },
  { fullName: "Nwigwe Stanley Chigozie", phone: "07089539863", email: "ogbustanley22@gmail.com", playerProfile: { gender: "MALE", dateOfBirth: "2003-05-28", dominantHand: "Ambidextrous", position: "Point Guard / Power Forward", heightCm: 191, weightKg: 91 } },
  { fullName: "Olubodun Daniel", phone: "07019970897", email: "olubodundaniel1@gmail.com", playerProfile: { gender: "MALE", dateOfBirth: "2009-06-24", dominantHand: "Right", position: "Small Forward", heightCm: 203, weightKg: 75 } },
  { fullName: "Benibo Daniel", phone: "09061246650", email: "dbenibo373@gmail.com", playerProfile: { gender: "MALE", dateOfBirth: "2006-11-09", dominantHand: "Right", position: "Point Guard", heightCm: 183, weightKg: 69 } },
  { fullName: "Shittu Olanrewaju", phone: "07017191365", email: "shittuhameen@gmail.com", playerProfile: { gender: "MALE", dateOfBirth: "2008-12-23", dominantHand: "Right", position: "Small Forward", heightCm: 196, weightKg: 82 } },
  { fullName: "Godswill Dennis Okiri", phone: "08143543268", email: "godswilldennis3@gmail.com", playerProfile: { gender: "MALE", dateOfBirth: "2009-06-15", dominantHand: "Right", position: "Small Forward", heightCm: 198, weightKg: 85 } },
  { fullName: "Neuman Ejirinade", phone: "09038818292", email: "ejirinaden@gmail.com", playerProfile: { gender: "MALE", dateOfBirth: "2011-11-06", dominantHand: "Right", position: "Point Guard", heightCm: 188, weightKg: 60 } },
];

type Result = Record<string, unknown>;

async function main() {
  const results: Result[] = [];
  for (const p of PLAYERS) {
    const created = await createAdminOfflineIntake(NEON_ULTRA_ORGANIZATION_ID, {
      createdById: ACTOR_ID,
      fullName: p.fullName,
      participantType: "PLAYER",
      phone: p.phone,
      email: p.email,
      playerProfile: p.playerProfile,
      seasonId: SEASON_ID,
      reason: "Batch offline recruitment onboarding — full profile provided by administrator.",
    });

    if (!created.created) {
      results.push({ fullName: p.fullName, skipped: true, matches: created.matches });
      continue;
    }

    const provisioned = await provisionPlayerOfflineIntake(NEON_ULTRA_ORGANIZATION_ID, created.intake.id, SEASON_ID, ACTOR_ID);
    if (provisioned.alreadyProvisioned) {
      results.push({ fullName: p.fullName, alreadyProvisioned: true });
      continue;
    }
    results.push({
      fullName: p.fullName,
      athleteId: provisioned.athlete.id,
      playerId: provisioned.player.id,
    });
  }

  // ensureAthletePublicId mutates via a direct tx.athlete.update(), not the returned object —
  // re-fetch the allocated UBA-XXXXXX ids for an accurate report.
  const athleteIds = results.map((r) => r.athleteId as string | undefined).filter((id): id is string => !!id);
  const withPublicIds = athleteIds.length > 0
    ? await prisma.athlete.findMany({ where: { id: { in: athleteIds } }, select: { id: true, ultraAthleteId: true } })
    : [];
  const publicIdByAthleteId = new Map(withPublicIds.map((a) => [a.id, a.ultraAthleteId]));
  const finalResults = results.map((r) => {
    const athleteId = r.athleteId as string | undefined;
    return athleteId ? { ...r, ultraAthleteId: publicIdByAthleteId.get(athleteId) ?? null } : r;
  });

  console.log(JSON.stringify(finalResults, null, 2));
}

main().finally(() => prisma.$disconnect());
