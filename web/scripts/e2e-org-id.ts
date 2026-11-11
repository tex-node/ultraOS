import { prisma } from "../src/lib/prisma";

// Prints the seeded organization's id, for the local harness to pass to e2e-prepare.ts.
//
// No top-level await: tsx compiles these files as CJS, which rejects it. A file rather than `node --eval` because the eval
// form needs --input-type=module and quoting that differs between shells (on Windows it lost the argument entirely).
async function main() {
  const slug = process.env.E2E_ORG_SLUG ?? "e2e-league";
  const organization = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!organization) {
    console.error(`seeded organization not found: ${slug}`);
    process.exit(1);
  }
  console.log(organization.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
