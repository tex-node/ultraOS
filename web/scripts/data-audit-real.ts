import "dotenv/config";
import { auditRealData } from "../src/lib/data-hygiene";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log(JSON.stringify(await auditRealData(), null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      dryRun: true,
      error: "Database audit could not complete.",
      code: typeof error === "object" && error && "code" in error ? error.code : undefined,
    }, null, 2));
    process.exit(1);
  });
