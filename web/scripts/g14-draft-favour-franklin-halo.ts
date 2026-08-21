import {
  confirmSecondaryDraftPick,
  reserveSecondaryDraftPick,
  revealSecondaryDraftPick,
  markSecondaryDraftPickRevealing,
} from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const WOMEN_SECONDARY_DRAFT_ID = "cmsonuv3i0000pmkkfx61rzba";
const FAVOUR_FRANKLIN_PLAYER_ID = "cmrb30eqc00wputkk86emwtfu";
const HALO_SEASON_CLUB_ID = "cmqfqpnqs0011lgkkg2pvftnj";

async function main() {
  const pick = await reserveSecondaryDraftPick({
    draftId: WOMEN_SECONDARY_DRAFT_ID,
    playerId: FAVOUR_FRANKLIN_PLAYER_ID,
    round: 1,
    seasonClubId: HALO_SEASON_CLUB_ID,
    userId: ACTOR_ID,
  });
  console.log("Reserved:", pick.id, "pick #", pick.pickNumber);

  await markSecondaryDraftPickRevealing(pick.id, ACTOR_ID);
  console.log("Marked revealing");

  await revealSecondaryDraftPick(pick.id, ACTOR_ID);
  console.log("Revealed");

  await confirmSecondaryDraftPick(pick.id, ACTOR_ID);
  console.log("Confirmed");

  const player = await prisma.player.findUniqueOrThrow({
    where: { id: FAVOUR_FRANKLIN_PLAYER_ID },
    select: { status: true, seasonClubId: true },
  });
  const halo = await prisma.player.count({ where: { seasonClubId: HALO_SEASON_CLUB_ID } });
  console.log("Favour Franklin now:", JSON.stringify(player));
  console.log("Halo roster count:", halo);
}

main().finally(() => prisma.$disconnect());
