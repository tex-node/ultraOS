import {
  confirmSecondaryDraftPick,
  reserveSecondaryDraftPick,
  revealSecondaryDraftPick,
  markSecondaryDraftPickRevealing,
} from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const WOMEN_SECONDARY_DRAFT_ID = "cmsonuv3i0000pmkkfx61rzba";

const picks = [
  { club: "Eclipse", name: "Emmanuel Boluwatife Peace", playerId: "cmsp6av2v0003yxkksdtw73zz", seasonClubId: "cmqfqpnrt001dlgkkskzah895" },
  { club: "Ember", name: "Imole Olorunfemi", playerId: "cmsp6w68n00027ekk2klimhde", seasonClubId: "cmqfqpnrb0017lgkkm9i40f6u" },
  { club: "Nova", name: "Ewohon Adaeze Vanessa", playerId: "cmsp6xis6000358kk9y8quwpe", seasonClubId: "cmqfqpnq6000vlgkk3tyi7n08" },
];

async function main() {
  let round = 13;
  for (const pick of picks) {
    const reserved = await reserveSecondaryDraftPick({ organizationId: "cmt4odhgn0000wokk8fbwr6ro", 
      draftId: WOMEN_SECONDARY_DRAFT_ID,
      playerId: pick.playerId,
      round,
      seasonClubId: pick.seasonClubId,
      userId: ACTOR_ID,
    });
    await markSecondaryDraftPickRevealing("cmt4odhgn0000wokk8fbwr6ro", reserved.id, ACTOR_ID);
    await revealSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", reserved.id, ACTOR_ID);
    await confirmSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", reserved.id, ACTOR_ID);
    console.log(`${pick.name} -> ${pick.club} confirmed (pick #${reserved.pickNumber})`);
    round++;
  }

  const rows = await prisma.$queryRaw<Array<{ name: string; players: bigint }>>`
    SELECT c.name, COUNT(p.id) AS players
    FROM "SeasonClub" sc
    JOIN "Club" c ON c.id = sc."clubId"
    JOIN "Division" d ON d.id = sc."divisionId"
    LEFT JOIN "Player" p ON p."seasonClubId" = sc.id
    WHERE d.name = 'Women''s Division'
    GROUP BY c.name
    ORDER BY c.name;
  `;
  console.log("\nWomen's clubs now:");
  for (const r of rows) console.log(`${r.name}: ${r.players}/8`);
}

main().finally(() => prisma.$disconnect());
