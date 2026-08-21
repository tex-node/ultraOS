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

const SAMUEL_PLAYER_ID = "cmsmm7wch00482okkhksuq1hx";
const GRACE_PLAYER_ID = "cmr4qurta00afutkkno8op2mr";

const REASON =
  "Administrator confirmed via the family that Grace Olutosoye (FEMALE, her own separate approved Application/Athlete/Player) " +
  "is the real intended Halo player, and her brother Samuel Olutosoye (MALE, his own separate approved Application/Athlete/Player) " +
  "was drafted onto Halo in error. Both identities are distinct, real, and complete on their own records — this is not a merge. " +
  "Samuel's Application/Athlete/Player rows are preserved unchanged except for the club assignment being reversed; no record is deleted.";

async function main() {
  const samuel = await prisma.player.findUniqueOrThrow({ where: { id: SAMUEL_PLAYER_ID } });
  if (samuel.seasonClubId !== HALO_SEASON_CLUB_ID) {
    throw new Error(`Refusing: Samuel's current seasonClubId (${samuel.seasonClubId}) is not Halo as expected.`);
  }
  // No DraftAllocation or DraftPick row exists for this assignment (verified by direct query) — it
  // predates the DraftEvent-based audit trail, so there is no standard correctAllocation/
  // correctSecondaryDraftPick record to correct through. This is a direct, fully-audited Player-field
  // reversal instead, preserving every other record untouched.
  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: SAMUEL_PLAYER_ID },
      data: { draftedAt: null, seasonClubId: null, status: "DRAFT_ELIGIBLE" },
    });
    await writeAuditLog(tx, {
      action: "PLAYER_CLUB_ASSIGNMENT_MANUALLY_CORRECTED",
      details: { athleteName: "Samuel Olutosoye", playerId: SAMUEL_PLAYER_ID, previousSeasonClubId: HALO_SEASON_CLUB_ID, reason: REASON },
      entityId: SAMUEL_PLAYER_ID,
      entityType: "Player",
      userId: ACTOR_ID,
    });
  });
  console.log("Reversed Samuel Olutosoye's Halo assignment (record preserved, just undrafted).");

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
