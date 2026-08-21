import {
  confirmSecondaryDraftPick,
  reserveSecondaryDraftPick,
  revealSecondaryDraftPick,
  markSecondaryDraftPickRevealing,
} from "../src/lib/draft-events";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const WOMEN_SECONDARY_DRAFT_ID = "cmsonuv3i0000pmkkfx61rzba";

const CLUBS = {
  Eclipse: "cmqfqpnrt001dlgkkskzah895",
  Ember: "cmqfqpnrb0017lgkkm9i40f6u",
  Halo: "cmqfqpnqs0011lgkkg2pvftnj",
  Nova: "cmqfqpnq6000vlgkk3tyi7n08",
};

const picks = [
  { club: "Halo", name: "Emmanuel Amarachi", playerId: "cmsp23icy0002mokkd7x3z56o" },
  { club: "Halo", name: "Eric Divine", playerId: "cmsp39cam0002xhkklb6ighdc" },
  { club: "Halo", name: "Abigail Effiong Akpan", playerId: "cmsozw8gz000axvkk258h01ze" },
  { club: "Halo", name: "Ginika Ezeogu", playerId: "cmsp0if880001eukkxsf7uf5s" },
  { club: "Halo", name: "Precious Favour Johnson", playerId: "cmsozw8ff0006xvkkkyhvmddi" },
  { club: "Eclipse", name: "Ada Gift Okechukwu", playerId: "cmsozw8do0002xvkkbwawc6br" },
  { club: "Eclipse", name: "Okoro Nmesomachukwu Naomi", playerId: "cmsp1cunt00026hkktqjbprks" },
  { club: "Ember", name: "Godwin Nneoma", playerId: "cmrhvoq7q000g0xkkkcm2i31w" },
  { club: "Ember", name: "Roli Omatseye", playerId: "cmsp0ifa10005eukkci398g9v" },
  { club: "Nova", name: "Omolola Adeseke Rachael", playerId: "cmsp2lflw0007g8kkyght6g78" },
  { club: "Nova", name: "Kemepade Precious", playerId: "cmsp2lfk90003g8kk8r9mkb8h" },
] as const;

async function main() {
  let round = 2;
  for (const pick of picks) {
    const seasonClubId = CLUBS[pick.club as keyof typeof CLUBS];
    const reserved = await reserveSecondaryDraftPick({
      draftId: WOMEN_SECONDARY_DRAFT_ID,
      playerId: pick.playerId,
      round,
      seasonClubId,
      userId: ACTOR_ID,
    });
    await markSecondaryDraftPickRevealing(reserved.id, ACTOR_ID);
    await revealSecondaryDraftPick(reserved.id, ACTOR_ID);
    await confirmSecondaryDraftPick(reserved.id, ACTOR_ID);
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
