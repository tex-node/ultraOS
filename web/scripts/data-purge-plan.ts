import "dotenv/config";
import { purgePlan } from "../src/lib/data-hygiene";
import { prisma } from "../src/lib/prisma";

const origin = process.argv.includes("--rehearsal") ? "REHEARSAL" : "DEMO";

async function main() {
  if (process.argv.includes("--apply")) {
    throw new Error("Destructive purge apply mode is not enabled yet. Review dry-run report and backup policy first.");
  }
  console.log(JSON.stringify(await purgePlan(origin), null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
