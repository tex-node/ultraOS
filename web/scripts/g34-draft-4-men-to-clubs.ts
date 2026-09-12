import {
  confirmSecondaryDraftPick,
  reserveSecondaryDraftPick,
  revealSecondaryDraftPick,
  markSecondaryDraftPickRevealing,
} from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const MEN_SECONDARY_DRAFT_ID = "cmsmoy1730000mukk29tuvcyw";

const picks = [
  { clubName: "Apex", playerId: "cmr7q228b00sxutkkpo1p5klp", playerName: "Elijah Nwodo", seasonClubId: "cmqfqpnod000dlgkku9sqb9nm" },
  { clubName: "Flux", playerId: "cmr4r6x7x00csutkkxxneqqpn", playerName: "Munachi Okafor", seasonClubId: "cmqfqpnoz000jlgkkv1i612md" },
  { clubName: "Surge", playerId: "cmsp1c52f00033wkkys578qc2", playerName: "Emmanuel Jacob", seasonClubId: "cmqfqpnpm000plgkk6fofe078" },
  { clubName: "Vortex", playerId: "cmr4suhfi00i4utkk0dy9566n", playerName: "Favour Chinemerem Ejelonu", seasonClubId: "cmqfqpnm20007lgkk0nfwj431" },
];

async function main() {
  let round = 1;
  for (const pick of picks) {
    const reserved = await reserveSecondaryDraftPick({ organizationId: "cmt4odhgn0000wokk8fbwr6ro", 
      draftId: MEN_SECONDARY_DRAFT_ID,
      playerId: pick.playerId,
      round,
      seasonClubId: pick.seasonClubId,
      userId: ACTOR_ID,
    });
    await markSecondaryDraftPickRevealing("cmt4odhgn0000wokk8fbwr6ro", reserved.id, ACTOR_ID);
    await revealSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", reserved.id, ACTOR_ID);
    await confirmSecondaryDraftPick("cmt4odhgn0000wokk8fbwr6ro", reserved.id, ACTOR_ID);
    console.log(`${pick.playerName} -> ${pick.clubName} confirmed (pick #${reserved.pickNumber})`);
    round++;
  }

  const rows = await prisma.$queryRaw<Array<{ name: string; players: bigint }>>`
    SELECT c.name, COUNT(p.id) AS players
    FROM "SeasonClub" sc
    JOIN "Club" c ON c.id = sc."clubId"
    LEFT JOIN "Player" p ON p."seasonClubId" = sc.id
    WHERE sc.id IN ('cmqfqpnod000dlgkku9sqb9nm','cmqfqpnoz000jlgkkv1i612md','cmqfqpnpm000plgkk6fofe078','cmqfqpnm20007lgkk0nfwj431')
    GROUP BY c.name;
  `;
  console.log("\nMen's clubs now:");
  for (const r of rows) console.log(`${r.name}: ${r.players}/8`);
}

main().finally(() => prisma.$disconnect());
