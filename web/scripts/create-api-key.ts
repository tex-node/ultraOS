import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createApiKey } from "../src/lib/api-v1/api-keys";

// Creates one API key through the same service the settings action calls and prints the raw key.
//
//   ORG=<id> ACTOR=<userId> DATABASE_URL=... npx tsx scripts/create-api-key.ts [--name X] [--tier PRO]
//
// The key is the ONLY thing on stdout (so a shell can capture it directly); the id/prefix line goes to stderr.
// Written as main().then() rather than top-level await: the first version used top-level await and tsx failed
// with a TransformError before running a line.
const ORG = process.env.ORG;
const ACTOR = process.env.ACTOR;

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  if (!ORG || !ACTOR) {
    console.error("usage: ORG=<id> ACTOR=<userId> DATABASE_URL=... npx tsx scripts/create-api-key.ts [--name X] [--tier PRO]");
    process.exitCode = 1;
    return;
  }
  const created = await withOrganizationContext(ORG, (tx) =>
    createApiKey(tx, {
      organizationId: ORG,
      userId: ACTOR,
      name: arg("name", "Verification key"),
      tier: arg("tier", "BASIC") as "BASIC" | "PRO" | "ENTERPRISE",
    }),
  );
  console.error(`created ${created.id} (${created.prefix}, ${created.tier})`);
  process.stdout.write(created.rawKey);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
