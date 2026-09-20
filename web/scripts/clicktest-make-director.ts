import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { upsertRoleAssignment } from "../src/lib/user-roles";

const EMAIL = "clicktest-director@neonultra.ng";
const PASSWORD = "Ultra-Click-Test-2026!";

async function main() {
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const org = await c.organization.findUniqueOrThrow({ where: { slug: "neon-ultra" }, select: { id: true } });
    const user = await c.user.upsert({
      where: { email: EMAIL },
      update: { name: "Click Test Director", passwordHash: await hash(PASSWORD, 12), role: "TOURNAMENT_DIRECTOR", isActive: true },
      create: { name: "Click Test Director", email: EMAIL, passwordHash: await hash(PASSWORD, 12), role: "TOURNAMENT_DIRECTOR", isActive: true },
      select: { id: true, email: true },
    });
    for (const role of ["TOURNAMENT_DIRECTOR", "FAN"] as const) {
      await upsertRoleAssignment(c as never, { userId: user.id, role: role as never, organizationId: org.id } as never);
    }
    console.log("CLICKTEST_DIRECTOR_READY:" + user.email);
  } finally {
    await c.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
