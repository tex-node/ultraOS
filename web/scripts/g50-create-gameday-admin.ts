import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { RecordOrigin, UserRole } from "../src/generated/prisma/enums";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const EMAIL = "gamekeeper@ultrabasketball.ng";
const NAME = "Aanu Neon";

async function main() {
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: EMAIL,
        name: NAME,
        passwordHash: await hash(randomUUID(), 12),
        recordOrigin: RecordOrigin.ADMIN_OFFLINE_INTAKE,
        role: UserRole.OFFICIAL,
        roles: { create: { role: UserRole.OFFICIAL, grantedById: ACTOR_ID } },
      },
    });
    await writeAuditLog(tx, {
      action: "GAMEDAY_ADMIN_ACCOUNT_CREATED",
      details: { email: EMAIL, name: NAME, reason: "Gameday admin account for Saturday's Season Zero opening tournament - operates live scoring and confirms results.", role: UserRole.OFFICIAL },
      entityId: created.id,
      entityType: "User",
      userId: ACTOR_ID,
    });
    return created;
  });
  console.log("Created user:", user.id, user.email, user.role);
  console.log("She should use /forgot-password with this email to set her own password.");
}

main().finally(() => prisma.$disconnect());
