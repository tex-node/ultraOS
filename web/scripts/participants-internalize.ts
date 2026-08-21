import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { internalizeApprovedApplications } from "../src/lib/participant-internalization";
import { prisma } from "../src/lib/prisma";

const apply = process.argv.includes("--apply");
const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
const scope = scopeArg?.split("=").slice(1).join("=");

async function main() {
  const report = await internalizeApprovedApplications({ apply, actorUserId: process.env.SYSTEM_ACTOR_USER_ID, scope });
  const file = path.join(process.cwd(), `participants-internalization-${apply ? "apply" : "dry-run"}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportFile: file, items: report.items.slice(0, 25) }, null, 2));
  if (report.failedRecords > 0 || report.ambiguousRecords > 0) process.exitCode = 1;
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      dryRun: !apply,
      error: error instanceof Error ? error.message : "Participant internalization could not complete.",
      code: typeof error === "object" && error && "code" in error ? error.code : undefined,
    }, null, 2));
    process.exit(1);
  });
