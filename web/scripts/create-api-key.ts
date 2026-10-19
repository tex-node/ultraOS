import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createApiKey } from "../src/lib/api-v1/api-keys";

// Creates one API key through the same service the settings action calls and prints the raw key.
//
//   npx tsx scripts/create-api-key.ts      (env: DATABASE_URL, ORG, ACTOR)
//
// The key is printed on the LAST line so a shell can capture it with `tail -1`; everything else is noise for
// the operator. Used by the verification runs, and by anyone who needs a key without opening a browser.
const ORG = process.env.ORG;
const ACTOR = process.env.ACTOR;
if (!ORG || !ACTOR) {
  console.error("usage: ORG=<id> ACTOR=<userId> DATABASE_URL=... npx tsx scripts/create-api-key.ts [--name X] [--tier PRO]");
  process.exit(1);
}
const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

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
await prisma.$disconnect();
