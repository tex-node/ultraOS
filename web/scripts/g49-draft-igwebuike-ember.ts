import {
  confirmSecondaryDraftPick,
  reserveSecondaryDraftPick,
  revealSecondaryDraftPick,
  markSecondaryDraftPickRevealing,
} from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const WOMEN_SECONDARY_DRAFT_ID = "cmsonuv3i0000pmkkfx61rzba";
const EMBER = "cmqfqpnrb0017lgkkm9i40f6u";
const PLAYER_ID = "cmsp86s7n0002f4kklhftz442";

async function main() {
  const reserved = await reserveSecondaryDraftPick({ organizationId: "cmt4odhgn0000wokk8fbwr6ro", 
    draftId: WOMEN_SECONDARY_DRAFT_ID,
    playerId: PLAYER_ID,
    round: 19,
    seasonClubId: EMBER,
    userId: ACTOR_ID,
  });
  await markSecondaryDraftPickRevealing("cmt4odhgn0000wokk8fbwr6ro", reserved.id, ACTOR_ID);
  await revealSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", reserved.id, ACTOR_ID);
  await confirmSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", reserved.id, ACTOR_ID);
  console.log(`Igwebuike Oluchukwu Sylvia -> Ember confirmed (pick #${reserved.pickNumber})`);

  const count = await prisma.player.count({ where: { seasonClubId: EMBER } });
  console.log("Ember roster count now:", count);
}

main().finally(() => prisma.$disconnect());
