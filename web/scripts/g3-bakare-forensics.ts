import { prisma } from "../src/lib/prisma";

const BAKARE_APP_ID = "cmr0mbfns0004z7kk9c35uh24";
const HISTORICAL_DUP_APP_ID = "cmqzfw4vw005ixbkkrfc1d7kq";

async function main() {
  const bakareApp = await prisma.application.findUnique({
    where: { id: BAKARE_APP_ID },
    select: { id: true, status: true, applicantUserId: true, submittedData: true, provisionedUserId: true, provisionedAthleteId: true, provisionedPlayerId: true, provisionedStaffId: true },
  });
  const historicalApp = await prisma.application.findUnique({
    where: { id: HISTORICAL_DUP_APP_ID },
    select: { id: true, status: true, applicantUserId: true, submittedData: true },
  });
  console.log("=== Bakare's canonical Application ===");
  console.log(JSON.stringify(bakareApp, null, 2));
  console.log("\n=== Historical duplicate Application (same login) ===");
  console.log(JSON.stringify(historicalApp, null, 2));

  const userId = bakareApp?.applicantUserId;
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, createdAt: true, roles: { select: { role: true, revokedAt: true } } } });
    console.log("\n=== Shared User account ===");
    console.log(JSON.stringify(user, null, 2));

    const athlete = await prisma.athlete.findUnique({ where: { userId }, include: { registrations: true } });
    console.log("\n=== Athlete currently linked to this User (Chijindu's) ===");
    console.log(JSON.stringify(athlete, null, 2));

    const allAppsForUser = await prisma.application.findMany({ where: { applicantUserId: userId }, select: { id: true, type: true, status: true, submittedData: true, createdAt: true } });
    console.log("\n=== ALL Applications ever linked to this User ===");
    console.log(JSON.stringify(allAppsForUser, null, 2));
  }
}

main().finally(() => prisma.$disconnect());
