// Read-only dedup check for a batch of 7 candidate players. No writes.
import { prisma } from "../src/lib/prisma";

const CANDIDATES = [
  { fullName: "Egbayelo Peter", email: "egbayelopeter06@gmail.com", phone: "09071241163" },
  { fullName: "Kukoyi Hassan", email: "kukoyihassan205@gmail.com", phone: "09152033388" },
  { fullName: "Bakare Oreoluwa Olohitare", email: "oreoluwabakare23@gmail.com", phone: undefined },
  { fullName: "Alonge Samuel Sylvester", email: "alonges13@gmail.com", phone: "09132064269" },
  { fullName: "Opeyemi Alagbala", email: "alagbalaopeyemi9@gmail.com", phone: "09161266898" },
  { fullName: "Emmanuel Boluwatife Peace", email: "boluwatifeemmanuel964@gmail.com", phone: "08035150637" },
  { fullName: "Sanusi Emmanuel", email: "emmajaeq@gmail.com", phone: "07047666587" },
];

async function main() {
  for (const c of CANDIDATES) {
    console.log(`\n=== ${c.fullName} ===`);
    const firstName = c.fullName.split(" ")[0];
    const lastNameGuess = c.fullName.split(" ").slice(-1)[0];

    const athleteMatches = await prisma.athlete.findMany({
      where: {
        OR: [
          { email: c.email },
          ...(c.phone ? [{ phone: c.phone }] : []),
          { AND: [{ firstName: { equals: firstName, mode: "insensitive" } }, { lastName: { equals: lastNameGuess, mode: "insensitive" } }] },
        ],
      },
      include: { registrations: { include: { season: true } } },
    });
    if (athleteMatches.length === 0) console.log("  No Athlete match.");
    for (const a of athleteMatches) {
      console.log(`  ATHLETE id=${a.id} name="${a.firstName} ${a.lastName}" email=${a.email} phone=${a.phone} dob=${a.dateOfBirth.toISOString().slice(0, 10)} gender=${a.gender} hand=${a.dominantHand} nationality=${a.nationality}`);
      for (const reg of a.registrations) {
        console.log(`    -> Player id=${reg.id} season=${reg.season?.id} heightCm=${reg.heightCm} weightKg=${reg.weightKg} position="${reg.position}" status=${reg.status} seasonClubId=${reg.seasonClubId}`);
      }
    }

    const appMatches = await prisma.application.findMany({
      where: {
        type: "PLAYER",
        OR: [
          { submittedData: { path: ["email"], equals: c.email } },
          ...(c.phone ? [{ submittedData: { path: ["phone"], equals: c.phone } }] : []),
        ],
      },
      select: { id: true, status: true, provisioningStatus: true, submittedData: true, provisionedAthleteId: true, provisionedPlayerId: true },
    });
    if (appMatches.length === 0) console.log("  No Application match.");
    for (const app of appMatches) {
      console.log(`  APPLICATION id=${app.id} status=${app.status} provisioningStatus=${app.provisioningStatus} provisionedAthleteId=${app.provisionedAthleteId} provisionedPlayerId=${app.provisionedPlayerId}`);
      console.log(`    submittedData=${JSON.stringify(app.submittedData)}`);
    }

    const intakeMatches = await prisma.adminOfflineIntake.findMany({
      where: {
        OR: [
          { email: c.email },
          ...(c.phone ? [{ phone: c.phone }] : []),
        ],
      },
      select: { id: true, fullName: true, status: true, playerProfile: true },
    });
    if (intakeMatches.length === 0) console.log("  No AdminOfflineIntake match.");
    for (const intake of intakeMatches) {
      console.log(`  ADMIN_OFFLINE_INTAKE id=${intake.id} fullName="${intake.fullName}" status=${intake.status}`);
      console.log(`    playerProfile=${JSON.stringify(intake.playerProfile)}`);
    }
  }
  console.log("\n=== Batch check complete (read-only, zero writes) ===");
}

main().finally(() => prisma.$disconnect());
