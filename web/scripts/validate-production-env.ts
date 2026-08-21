import "dotenv/config";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

const requiredEnv = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
  "PUBLIC_APP_URL",
] as const;

async function main() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  const backupDir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
  if (!existsSync(backupDir) && process.env.CREATE_BACKUP_DIR === "YES") {
    mkdirSync(backupDir, { recursive: true });
  }

  const dbReachable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  const failedMigrations = dbReachable
    ? await prisma
        .$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*) FROM "_prisma_migrations" WHERE "finished_at" IS NULL OR "rolled_back_at" IS NOT NULL`,
        )
        .then((rows) => Number(rows[0]?.count ?? 0))
        .catch(() => -1)
    : -1;

  const report = {
    nodeEnv: process.env.NODE_ENV ?? "not set",
    missingEnvironmentVariables: missing,
    databaseReachable: dbReachable,
    unresolvedMigrationRows: failedMigrations,
    backupDirectory: {
      path: backupDir,
      exists: existsSync(backupDir),
    },
    fileStorageConfigured: Boolean(process.env.R2_BUCKET || process.env.S3_BUCKET || process.env.FILE_STORAGE_BUCKET),
    paymentConfigured: Boolean(process.env.PAYMENT_PROVIDER || process.env.PAYSTACK_SECRET_KEY || process.env.STRIPE_SECRET_KEY),
    offHostBackupDestinationConfigured: Boolean(process.env.OFF_HOST_BACKUP_DESTINATION),
    seedPasswordLooksUnsafe:
      !process.env.SEED_ADMIN_PASSWORD ||
      process.env.SEED_ADMIN_PASSWORD === "change-me-before-use" ||
      process.env.SEED_ADMIN_PASSWORD.length < 12,
    demoSeedBlockedInProduction: process.env.NODE_ENV === "production",
    destructiveResetProtected: process.env.CONFIRM_CLEAR_DEMO !== "YES",
  };

  console.log(JSON.stringify(report, null, 2));

  if (
    missing.length > 0 ||
    !report.databaseReachable ||
    report.unresolvedMigrationRows !== 0 ||
    report.nodeEnv !== "production" ||
    report.seedPasswordLooksUnsafe
  ) {
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
