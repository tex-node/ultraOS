import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { internalizeApprovedApplications } from "../src/lib/participant-internalization";
import { prisma } from "../src/lib/prisma";

function argValue(flag: string): string | undefined {
  const eqPrefix = `${flag}=`;
  const eqArg = process.argv.find((arg) => arg.startsWith(eqPrefix));
  if (eqArg) return eqArg.slice(eqPrefix.length);
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) return process.argv[index + 1];
  return undefined;
}

const apply = process.argv.includes("--apply");
const scope = argValue("--scope");
const applicationId = argValue("--application-id");
const organizationId = argValue("--organization-id");

async function main() {
  const report = await internalizeApprovedApplications({
    apply,
    actorUserId: process.env.SYSTEM_ACTOR_USER_ID,
    scope,
    applicationId,
    organizationId,
  });

  // A narrow selector run is meant to be inspected in full, not sampled - print every candidate,
  // not just the first 25, and print it before reporting apply/dry-run success so the exact
  // candidate set is visible even if something after this point fails.
  const usingNarrowSelector = Boolean(applicationId || organizationId);
  console.log(JSON.stringify({
    dryRun: !apply,
    applicationsScanned: report.applicationsScanned,
    selector: { applicationId, organizationId, scope },
    candidates: usingNarrowSelector ? report.items : report.items.slice(0, 25),
  }, null, 2));

  const file = path.join(process.cwd(), `participants-internalization-${apply ? "apply" : "dry-run"}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportFile: file, items: usingNarrowSelector ? report.items : report.items.slice(0, 25) }, null, 2));
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
