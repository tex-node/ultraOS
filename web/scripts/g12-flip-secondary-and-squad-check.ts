import { AthleteGender, DraftSelectionGroup } from "../src/generated/prisma/enums";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const MEN_DIVISION_ID = "cmqfqpnke0003lgkkkgev3oyt";
const WOMEN_DIVISION_ID = "cmqfqpnkl0004lgkkk2bjeqfm";

const toFlip = [
  { playerId: "cmrb30eqc00wputkk86emwtfu", name: "Favour Frankly (Favour Franklin)" },
  { playerId: "cmrhvoq7q000g0xkkkcm2i31w", name: "Godwin Nneoma favour (Godwin Nneoma)" },
];

async function main() {
  for (const target of toFlip) {
    const player = await prisma.player.findUniqueOrThrow({ where: { id: target.playerId } });
    if (player.draftSelectionGroup === DraftSelectionGroup.SECONDARY_DRAFT) {
      console.log(`Already SECONDARY_DRAFT: ${target.name}`);
      continue;
    }
    if (player.seasonClubId) {
      throw new Error(`Refusing: ${target.name} already has a SeasonClub assignment.`);
    }
    await prisma.$transaction(async (tx) => {
      const oldGroup = player.draftSelectionGroup;
      await tx.player.update({ where: { id: target.playerId }, data: { draftSelectionGroup: DraftSelectionGroup.SECONDARY_DRAFT } });
      await writeAuditLog(tx, {
        action: "PLAYER_DRAFT_SELECTION_GROUP_CHANGED",
        details: { newGroup: DraftSelectionGroup.SECONDARY_DRAFT, oldGroup, playerId: target.playerId, playerName: target.name, reason: "Already-approved player confirmed eligible to help complete an 8-man squad." },
        entityId: target.playerId,
        entityType: "Player",
        userId: ACTOR_ID,
      });
    });
    console.log(`Flipped to SECONDARY_DRAFT: ${target.name}`);
  }

  console.log("\n--- Current rostered squad sizes (seasonClubId set) ---");
  const rosterRows = await prisma.$queryRaw<Array<{ name: string; division: string; players: bigint }>>`
    SELECT c.name, d.name AS division, COUNT(p.id) AS players
    FROM "SeasonClub" sc
    JOIN "Club" c ON c.id = sc."clubId"
    JOIN "Division" d ON d.id = sc."divisionId"
    LEFT JOIN "Player" p ON p."seasonClubId" = sc.id
    GROUP BY c.name, d.name
    ORDER BY d.name, c.name;
  `;
  let allEight = true;
  for (const row of rosterRows) {
    const count = Number(row.players);
    if (count !== 8) allEight = false;
    console.log(`${row.division.padEnd(18)} ${row.name.padEnd(8)} ${count}/8`);
  }

  console.log("\n--- Undrafted SECONDARY_DRAFT-eligible pool (seasonClubId null) ---");
  const men = await prisma.player.count({
    where: { athlete: { gender: AthleteGender.MALE }, draftSelectionGroup: DraftSelectionGroup.SECONDARY_DRAFT, seasonClubId: null, seasonId: SEASON_ID },
  });
  const women = await prisma.player.count({
    where: { athlete: { gender: AthleteGender.FEMALE }, draftSelectionGroup: DraftSelectionGroup.SECONDARY_DRAFT, seasonClubId: null, seasonId: SEASON_ID },
  });
  console.log(`Men's eligible pool: ${men}`);
  console.log(`Women's eligible pool: ${women}`);

  const menShortfall = await prisma.seasonClub.findMany({
    where: { divisionId: MEN_DIVISION_ID },
    include: { club: true, players: true },
  });
  const womenShortfall = await prisma.seasonClub.findMany({
    where: { divisionId: WOMEN_DIVISION_ID },
    include: { club: true, players: true },
  });
  const menNeeded = menShortfall.reduce((sum, sc) => sum + Math.max(0, 8 - sc.players.length), 0);
  const womenNeeded = womenShortfall.reduce((sum, sc) => sum + Math.max(0, 8 - sc.players.length), 0);
  console.log(`\nMen's total shortfall to reach 8/8 everywhere: ${menNeeded} (pool has ${men} — ${men >= menNeeded ? "SUFFICIENT" : "SHORT by " + (menNeeded - men)})`);
  console.log(`Women's total shortfall to reach 8/8 everywhere: ${womenNeeded} (pool has ${women} — ${women >= womenNeeded ? "SUFFICIENT" : "SHORT by " + (womenNeeded - women)})`);

  console.log("\n--- Offline intake still pending (not yet real Players) ---");
  const pendingIntake = await prisma.adminOfflineIntake.findMany({
    where: { participantType: "PLAYER", status: { not: "PROVISIONED" } },
    select: { fullName: true, status: true, playerProfile: true },
  });
  for (const p of pendingIntake) {
    console.log(`${p.fullName} — ${p.status}`);
  }

  console.log(`\nAll clubs at 8/8 right now: ${allEight ? "YES" : "NO"}`);
}

main().finally(() => prisma.$disconnect());
