import { DraftSelectionGroup } from "../src/generated/prisma/enums";
import {
  confirmSecondaryDraftPick,
  reserveSecondaryDraftPick,
  revealSecondaryDraftPick,
  markSecondaryDraftPickRevealing,
} from "../src/lib/draft-events";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const WOMEN_SECONDARY_DRAFT_ID = "cmsonuv3i0000pmkkfx61rzba";
const HALO_SEASON_CLUB_ID = "cmqfqpnqs0011lgkkg2pvftnj";
const GRACE_PLAYER_ID = "cmr4qurta00afutkkno8op2mr";

async function main() {
  const grace = await prisma.player.findUniqueOrThrow({ where: { id: GRACE_PLAYER_ID } });
  if (grace.draftSelectionGroup !== DraftSelectionGroup.SECONDARY_DRAFT) {
    if (grace.seasonClubId) throw new Error("Refusing: Grace already has a SeasonClub assignment.");
    await prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { id: GRACE_PLAYER_ID }, data: { draftSelectionGroup: DraftSelectionGroup.SECONDARY_DRAFT } });
      await writeAuditLog(tx, {
        action: "PLAYER_DRAFT_SELECTION_GROUP_CHANGED",
        details: { newGroup: DraftSelectionGroup.SECONDARY_DRAFT, oldGroup: grace.draftSelectionGroup, playerId: GRACE_PLAYER_ID, playerName: "Grace Olutosoye", reason: "Confirmed eligible to replace her brother's erroneous Halo assignment." },
        entityId: GRACE_PLAYER_ID,
        entityType: "Player",
        userId: ACTOR_ID,
      });
    });
    console.log("Flipped Grace to SECONDARY_DRAFT.");
  }

  const pick = await reserveSecondaryDraftPick({
    draftId: WOMEN_SECONDARY_DRAFT_ID,
    playerId: GRACE_PLAYER_ID,
    round: 1,
    seasonClubId: HALO_SEASON_CLUB_ID,
    userId: ACTOR_ID,
  });
  console.log("Reserved:", pick.id, "pick #", pick.pickNumber);
  await markSecondaryDraftPickRevealing(pick.id, ACTOR_ID);
  await revealSecondaryDraftPick(pick.id, ACTOR_ID);
  await confirmSecondaryDraftPick(pick.id, ACTOR_ID);
  console.log("Grace Olutosoye confirmed to Halo.");

  const halo = await prisma.player.findMany({
    where: { seasonClubId: HALO_SEASON_CLUB_ID },
    include: { athlete: { select: { firstName: true, lastName: true, gender: true } } },
  });
  console.log("\nHalo roster now:");
  for (const p of halo) console.log(`- ${p.athlete.firstName} ${p.athlete.lastName} (${p.athlete.gender})`);
  console.log(`Total: ${halo.length}/8`);
}

main().finally(() => prisma.$disconnect());
