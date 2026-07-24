import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const confirmed = process.env.CONFIRM_CLEAR_DEMO === "YES";

async function count(sql: string) {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const report = {
    demoAthletes: await count(`SELECT COUNT(*) FROM "Athlete" WHERE "email" LIKE '%@athletes.neonultra.ng'`),
    demoClubs: await count(`SELECT COUNT(*) FROM "Club" WHERE "shortName" IN ('VTX','APX','FLX','SRG','NVA','HLO','EMB','ECL')`),
    demoEvents: await count(`SELECT COUNT(*) FROM "Event" WHERE "id" LIKE 'seed-event-%'`),
    demoStaff: await count(`SELECT COUNT(*) FROM "Staff" WHERE "id" LIKE 'seed-coach-%'`),
  };

  console.log(JSON.stringify({ confirmed, report }, null, 2));

  if (!confirmed) {
    console.log("Dry run only. Set CONFIRM_CLEAR_DEMO=YES to remove known demo records.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM "MVPVote" WHERE "playerId" IN (SELECT "id" FROM "Player" WHERE "athleteId" IN (SELECT "id" FROM "Athlete" WHERE "email" LIKE '%@athletes.neonultra.ng'))`);
    await tx.$executeRawUnsafe(`DELETE FROM "PlayerStat" WHERE "playerId" IN (SELECT "id" FROM "Player" WHERE "athleteId" IN (SELECT "id" FROM "Athlete" WHERE "email" LIKE '%@athletes.neonultra.ng'))`);
    await tx.$executeRawUnsafe(`DELETE FROM "GameEvent" WHERE "playerId" IN (SELECT "id" FROM "Player" WHERE "athleteId" IN (SELECT "id" FROM "Athlete" WHERE "email" LIKE '%@athletes.neonultra.ng'))`);
    await tx.$executeRawUnsafe(`DELETE FROM "DraftPick" WHERE "playerId" IN (SELECT "id" FROM "Player" WHERE "athleteId" IN (SELECT "id" FROM "Athlete" WHERE "email" LIKE '%@athletes.neonultra.ng'))`);
    await tx.$executeRawUnsafe(`DELETE FROM "Player" WHERE "athleteId" IN (SELECT "id" FROM "Athlete" WHERE "email" LIKE '%@athletes.neonultra.ng')`);
    await tx.$executeRawUnsafe(`DELETE FROM "Athlete" WHERE "email" LIKE '%@athletes.neonultra.ng'`);
    await tx.$executeRawUnsafe(`DELETE FROM "TeamStat" WHERE "seasonClubId" IN (SELECT "id" FROM "SeasonClub" WHERE "clubId" IN (SELECT "id" FROM "Club" WHERE "shortName" IN ('VTX','APX','FLX','SRG','NVA','HLO','EMB','ECL')))`);
    await tx.$executeRawUnsafe(`DELETE FROM "Standing" WHERE "seasonClubId" IN (SELECT "id" FROM "SeasonClub" WHERE "clubId" IN (SELECT "id" FROM "Club" WHERE "shortName" IN ('VTX','APX','FLX','SRG','NVA','HLO','EMB','ECL')))`);
    await tx.$executeRawUnsafe(`DELETE FROM "Fixture" WHERE "homeSeasonClubId" IN (SELECT "id" FROM "SeasonClub" WHERE "clubId" IN (SELECT "id" FROM "Club" WHERE "shortName" IN ('VTX','APX','FLX','SRG','NVA','HLO','EMB','ECL'))) OR "awaySeasonClubId" IN (SELECT "id" FROM "SeasonClub" WHERE "clubId" IN (SELECT "id" FROM "Club" WHERE "shortName" IN ('VTX','APX','FLX','SRG','NVA','HLO','EMB','ECL')))`);
    await tx.$executeRawUnsafe(`DELETE FROM "SeasonClub" WHERE "clubId" IN (SELECT "id" FROM "Club" WHERE "shortName" IN ('VTX','APX','FLX','SRG','NVA','HLO','EMB','ECL'))`);
    await tx.$executeRawUnsafe(`DELETE FROM "FanClub" WHERE "clubId" IN (SELECT "id" FROM "Club" WHERE "shortName" IN ('VTX','APX','FLX','SRG','NVA','HLO','EMB','ECL'))`);
    await tx.$executeRawUnsafe(`DELETE FROM "Club" WHERE "shortName" IN ('VTX','APX','FLX','SRG','NVA','HLO','EMB','ECL')`);
    await tx.$executeRawUnsafe(`DELETE FROM "Staff" WHERE "id" LIKE 'seed-coach-%'`);
    await tx.$executeRawUnsafe(`DELETE FROM "Event" WHERE "id" LIKE 'seed-event-%'`);
  });

  console.log("Known demo records removed.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
