import "dotenv/config";
import { preflightReport } from "../src/lib/season-zero-preflight";
import { prisma } from "../src/lib/prisma";

async function main() {
  const report = await preflightReport();
  console.log(JSON.stringify(report, null, 2));

  const demoTotal = Object.values(report.demoRecordsDetected).reduce((sum, count) => sum + count, 0);
  const hasErrors =
    demoTotal > 0 ||
    report.missingProductionConfiguration.length > 0 ||
    report.missingAdminCredentials.length > 0 ||
    report.databaseMigrationStatus.unresolvedMigrationRows > 0;

  if (hasErrors) {
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
