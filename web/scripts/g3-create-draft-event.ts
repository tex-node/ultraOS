import { randomBytes } from "node:crypto";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";

async function main() {
  const season = await prisma.season.findFirst({ where: { status: { in: ["ACTIVE", "DRAFT"] } }, orderBy: { startDate: "desc" } });
  if (!season) throw new Error("No active/draft Season found.");

  const draftEvent = await prisma.$transaction(async (tx) => {
    const created = await tx.draftEvent.create({
      data: {
        createdById: ACTOR_ID,
        displayToken: randomBytes(24).toString("hex"),
        name: "Ultra Basketball Season Zero Draft",
        publicTitle: "Ultra Basketball Season Zero Draft",
        seasonId: season.id,
      },
    });
    await writeAuditLog(tx, {
      action: "DRAFT_EVENT_CREATED",
      details: { draftEventId: created.id, seasonId: season.id, operatingMode: created.operatingMode, status: created.status, currentStage: created.currentStage },
      entityId: created.id,
      entityType: "DraftEvent",
      userId: ACTOR_ID,
    });
    return created;
  });

  console.log(JSON.stringify(draftEvent, null, 2));
}

main().finally(() => prisma.$disconnect());
