import {
  confirmSecondaryDraftPick,
  correctSecondaryDraftPick,
  reserveSecondaryDraftPick,
  revealSecondaryDraftPick,
  markSecondaryDraftPickRevealing,
} from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const WOMEN_SECONDARY_DRAFT_ID = "cmsonuv3i0000pmkkfx61rzba";
const REASON = "Administrator requested a swap: Imole to Nova, Vanessa to Ember.";

const EMBER = "cmqfqpnrb0017lgkkm9i40f6u";
const NOVA = "cmqfqpnq6000vlgkk3tyi7n08";

async function main() {
  await correctSecondaryDraftPick("cmsp6yvq300052ykkwrsu64k4", ACTOR_ID, REASON); // Imole's Ember pick
  await correctSecondaryDraftPick("cmsp6yvrp000a2ykkhi26hgfn", ACTOR_ID, REASON); // Vanessa's Nova pick
  console.log("Corrected both original picks.");

  const swaps = [
    { club: "Nova", name: "Imole Olorunfemi", playerId: "cmsp6w68n00027ekk2klimhde", seasonClubId: NOVA },
    { club: "Ember", name: "Ewohon Adaeze Vanessa", playerId: "cmsp6xis6000358kk9y8quwpe", seasonClubId: EMBER },
  ];

  let round = 16;
  for (const s of swaps) {
    const reserved = await reserveSecondaryDraftPick({
      draftId: WOMEN_SECONDARY_DRAFT_ID,
      playerId: s.playerId,
      round,
      seasonClubId: s.seasonClubId,
      userId: ACTOR_ID,
    });
    await markSecondaryDraftPickRevealing(reserved.id, ACTOR_ID);
    await revealSecondaryDraftPick(reserved.id, ACTOR_ID);
    await confirmSecondaryDraftPick(reserved.id, ACTOR_ID);
    console.log(`${s.name} -> ${s.club} confirmed (pick #${reserved.pickNumber})`);
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
