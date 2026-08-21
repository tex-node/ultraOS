import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const WOMEN_DIVISION_ID = "cmqfqpnkl0004lgkkk2bjeqfm";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";

async function main() {
  const existing = await prisma.draft.findFirst({ where: { divisionId: WOMEN_DIVISION_ID, tier: "SECONDARY" } });
  if (existing) {
    console.log("Women's Secondary Draft already exists:", existing.id, existing.status);
    return;
  }

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.draft.create({
      data: {
        divisionId: WOMEN_DIVISION_ID,
        draftEventId: DRAFT_EVENT_ID,
        name: "Season Zero Secondary Draft (WOMEN)",
        seasonId: SEASON_ID,
        status: "LIVE",
        tier: "SECONDARY",
      },
    });
    await writeAuditLog(tx, {
      action: "SECONDARY_DRAFT_CREATED",
      details: { divisionId: WOMEN_DIVISION_ID, draftEventId: DRAFT_EVENT_ID, name: created.name, reason: "Set up to complete 8-man squads via offline-onboarded players.", seasonId: SEASON_ID },
      entityId: created.id,
      entityType: "Draft",
      userId: ACTOR_ID,
    });
    return created;
  });

  console.log("Created Women's Secondary Draft:", draft.id, draft.status);
}

main().finally(() => prisma.$disconnect());
