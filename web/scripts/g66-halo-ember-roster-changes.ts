import { writeAuditLog } from "../src/lib/audit";
import {
  confirmSecondaryDraftPick,
  markSecondaryDraftPickRevealing,
  reserveSecondaryDraftPick,
  revealSecondaryDraftPick,
} from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const WOMEN_SECONDARY_DRAFT_ID = "cmsonuv3i0000pmkkfx61rzba";

const HAWAU_PLAYER_ID = "cmrb2ysz100wautkkxdrzg45k";
const MBAH_PLAYER_ID = "cmrh5m3qt00y8utkkgn0xqz8t";
const ADESHINA_PLAYER_ID = "cmspryjym0003sbkk7f2wh54s";
const HALO_SEASON_CLUB_ID = "cmqfqpnqs0011lgkkg2pvftnj";

async function reversePlayer(playerId: string, reason: string) {
  const before = await prisma.player.findUniqueOrThrow({ where: { id: playerId }, include: { athlete: true, seasonClub: { include: { club: true } } } });
  await prisma.$transaction(async (tx) => {
    const updated = await tx.player.update({
      where: { id: playerId },
      data: { status: "DRAFT_ELIGIBLE", seasonClubId: null, draftSelectionGroup: "SECONDARY_DRAFT" },
    });
    await writeAuditLog(tx, {
      action: "PLAYER_DRAFT_REVERSED",
      details: {
        reason,
        previousClub: before.seasonClub?.club.name ?? null,
        previousStatus: before.status,
        previousGroup: before.draftSelectionGroup,
        newStatus: updated.status,
        newGroup: updated.draftSelectionGroup,
      },
      entityId: playerId,
      entityType: "Player",
      userId: ACTOR_ID,
    });
  });
  console.log(`Reversed: ${before.athlete.firstName} ${before.athlete.lastName} out of ${before.seasonClub?.club.name} -> DRAFT_ELIGIBLE / SECONDARY_DRAFT`);
}

async function main() {
  // 1. Hawau Ayomide out of Halo — no longer available.
  await reversePlayer(HAWAU_PLAYER_ID, "No longer available for games; released from Halo roster per admin instruction.");

  // 2. Mbah Chinyere out of Ember — no longer available.
  await reversePlayer(MBAH_PLAYER_ID, "No longer available for games; released from Ember roster per admin instruction.");

  // 3. Draft Adeshina Funmilayo into Halo as Hawau's replacement, via the real Secondary Draft flow.
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: WOMEN_SECONDARY_DRAFT_ID } });
  const round = draft.currentRound + 1;
  const pick = await reserveSecondaryDraftPick({
    draftId: WOMEN_SECONDARY_DRAFT_ID,
    playerId: ADESHINA_PLAYER_ID,
    seasonClubId: HALO_SEASON_CLUB_ID,
    round,
    userId: ACTOR_ID,
  });
  console.log("Reserved pick:", pick.id, "round", round);
  await markSecondaryDraftPickRevealing(pick.id, ACTOR_ID);
  await revealSecondaryDraftPick(pick.id, ACTOR_ID);
  await confirmSecondaryDraftPick(pick.id, ACTOR_ID);
  console.log("Adeshina Funmilayo confirmed to Halo.");

  const [halo, ember] = await prisma.seasonClub.findMany({
    where: { id: { in: [HALO_SEASON_CLUB_ID, "cmqfqpnrb0017lgkkm9i40f6u"] } },
    include: { club: true, players: true },
  });
  console.log(`\nFinal rosters: ${halo.club.name}=${halo.players.length}, ${ember.club.name}=${ember.players.length}`);
}

main().finally(() => prisma.$disconnect());
