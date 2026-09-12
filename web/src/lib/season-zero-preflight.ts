import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { demoDataCounts, realDataCounts, requiredConfigurationReport } from "@/lib/season-zero-readiness";

export async function preflightReport() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    AUTH_URL: Boolean(process.env.AUTH_URL),
    SEED_ADMIN_EMAIL: Boolean(process.env.SEED_ADMIN_EMAIL),
    SEED_ADMIN_PASSWORD: Boolean(process.env.SEED_ADMIN_PASSWORD),
    PUBLIC_APP_URL: Boolean(process.env.PUBLIC_APP_URL),
  };
  const backupDir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
  const dbReachable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

  if (!dbReachable) {
    return {
      generatedAt: new Date().toISOString(),
      demoRecordsDetected: {
        demoAthletes: 0,
        demoClubs: 0,
        demoEvents: 0,
        demoStaff: 0,
        demoSponsors: 0,
      },
      missingProductionConfiguration: ["Database unreachable"],
      missingAdminCredentials: ["SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD"].filter((key) => !env[key as keyof typeof env]),
      missingRequiredEnvironment: Object.entries(env)
        .filter(([, present]) => !present)
        .map(([key]) => key),
      existingRealDataRecordCounts: {
        users: 0,
        clubs: 0,
        seasonClubs: 0,
        athletes: 0,
        players: 0,
        coaches: 0,
        officials: 0,
        vendors: 0,
        events: 0,
        fixtures: 0,
        reservations: 0,
        orders: 0,
      },
      databaseMigrationStatus: {
        reachable: false,
        unresolvedMigrationRows: -1,
      },
      backupReadiness: {
        backupDirectory: backupDir,
        exists: existsSync(backupDir),
        offHostDestinationConfigured: Boolean(process.env.OFF_HOST_BACKUP_DESTINATION),
      },
    };
  }

  const configuration = await requiredConfigurationReport(prisma);
  const seasonId = configuration.season?.id;
  const demos = await demoDataCounts(prisma);
  const migrationRows = await prisma
    .$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) FROM "_prisma_migrations" WHERE "finished_at" IS NULL OR "rolled_back_at" IS NOT NULL`)
    .catch(() => [{ count: BigInt(0) }]);

  return {
    generatedAt: new Date().toISOString(),
    demoRecordsDetected: demos,
    missingProductionConfiguration: configuration.missing,
    missingAdminCredentials: ["SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD"].filter((key) => !env[key as keyof typeof env]),
    missingRequiredEnvironment: Object.entries(env)
      .filter(([, present]) => !present)
      .map(([key]) => key),
      existingRealDataRecordCounts: await realDataCounts(seasonId, prisma),
    databaseMigrationStatus: {
      reachable: dbReachable,
      unresolvedMigrationRows: Number(migrationRows[0]?.count ?? 0),
    },
    backupReadiness: {
      backupDirectory: backupDir,
      exists: existsSync(backupDir),
      offHostDestinationConfigured: Boolean(process.env.OFF_HOST_BACKUP_DESTINATION),
    },
  };
}
