import {
  confirmSecondaryDraftPick,
  markSecondaryDraftPickRevealing,
  reserveSecondaryDraftPick,
  revealSecondaryDraftPick,
} from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const WOMEN_SECONDARY_DRAFT_ID = "cmsonuv3i0000pmkkfx61rzba";

const picks = [
  { playerId: "cmr4s1rqy00f7utkkun41rkbc", seasonClubId: "cmqfqpnrt001dlgkkskzah895", label: "Onitolo Koyinsola Deborah -> Eclipse" },
  { playerId: "cmsrjmx5m00034skkxj1q0u8w", seasonClubId: "cmqfqpnqs0011lgkkg2pvftnj", label: "Yinka Daudu -> Halo" },
  { playerId: "cmsqefj9b0003b0kkx1eo4n1k", seasonClubId: "cmqfqpnq6000vlgkk3tyi7n08", label: "Iwajoba Rofiat -> Nova" },
];

async function main() {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: WOMEN_SECONDARY_DRAFT_ID } });
  let round = draft.currentRound + 1;

  for (const p of picks) {
    console.log(`\n=== ${p.label} ===`);
    const pick = await reserveSecondaryDraftPick({
      draftId: WOMEN_SECONDARY_DRAFT_ID,
      playerId: p.playerId,
      seasonClubId: p.seasonClubId,
      round,
      userId: ACTOR_ID,
    });
    console.log("Reserved:", pick.id, "round", round);
    await markSecondaryDraftPickRevealing(pick.id, ACTOR_ID);
    console.log("Marked revealing.");
    await revealSecondaryDraftPick(pick.id, ACTOR_ID);
    console.log("Revealed.");
    await confirmSecondaryDraftPick(pick.id, ACTOR_ID);
    console.log("Confirmed.");
    round++;
  }

  const rosters = await prisma.seasonClub.findMany({
    where: { id: { in: picks.map((p) => p.seasonClubId) } },
    include: { club: true, players: true },
  });
  console.log("\nFinal rosters:");
  for (const sc of rosters) console.log(`${sc.club.name}: ${sc.players.length}`);
}

main().finally(() => prisma.$disconnect());
