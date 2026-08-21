import selectedPlayers from "../src/data/season-zero-selected-players.json";
import { prisma } from "../src/lib/prisma";

const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const MEN_DIVISION_ID = "cmqfqpnke0003lgkkkgev3oyt";
const WOMEN_DIVISION_ID = "cmqfqpnkl0004lgkkk2bjeqfm";

const menCoachStaffIds = [
  "cmqurqfhh0001h3kkc6gfa79i", // Olusegun Imah
  "cmr0m6h8h0000z7kkfov56yoa", // Mcspencer Akpan
  "cmrh7mw160006c9kkuii9i0dk", // Christopher Ndifon Ekpe
  "cmrh7meov0003c9kknsj5pq1r", // Coach David Robinson
  "cmsm34n7w00046jkkm8brqy39", // Afunku Adeyinka
];
const womenCoachStaffIds = [
  "cmr0nqyoz0001utkkchz8uj8p", // Adetokunbo Olaosebikan Ijomah
  "cmr1tyxgt002gutkkor5xxxuh", // Bilqis Adekoya
  "cmsm34grj00016jkkthefvewo", // Udeaja Chioma Priscilla
  "cmsmlv4dp0005o9kke0kxrlnu", // Imomoh Kewwe Blessing
];

async function main() {
  const ids = selectedPlayers.map((p) => p.applicationId);
  const apps = await prisma.application.findMany({
    where: { id: { in: ids } },
    select: { id: true, provisionedPlayerId: true },
  });
  const playerIdByAppId = new Map(apps.map((a) => [a.id, a.provisionedPlayerId!]));

  const mainDraftByDivGroup = new Map<string, string[]>();
  for (const p of selectedPlayers) {
    if (p.draftSelectionGroup !== "MAIN_DRAFT") continue;
    const key = `${p.division}_${p.mainDraftGroupNumber}`;
    const playerId = playerIdByAppId.get(p.applicationId);
    if (!playerId) throw new Error(`No provisioned Player for ${p.applicationId}`);
    mainDraftByDivGroup.set(key, [...(mainDraftByDivGroup.get(key) ?? []), playerId]);
  }

  const squadIds: Record<string, string> = {};
  for (const division of ["MEN", "WOMEN"] as const) {
    const divisionId = division === "MEN" ? MEN_DIVISION_ID : WOMEN_DIVISION_ID;
    for (let group = 1; group <= 4; group++) {
      const key = `${division}_${group}`;
      const playerIds = mainDraftByDivGroup.get(key) ?? [];
      const squad = await prisma.draftSquad.create({
        data: {
          draftEventId: DRAFT_EVENT_ID,
          seasonId: SEASON_ID,
          divisionId,
          name: `${division === "MEN" ? "Men's" : "Women's"} Squad Group ${group}`,
          shortName: `${division}-G${group}`,
          sequence: group,
          members: { create: playerIds.map((playerId) => ({ playerId })) },
        },
      });
      squadIds[key] = squad.id;
      console.log(`Squad ${key}: ${squad.id} (${playerIds.length} players)`);
    }
  }

  let seq = 1;
  for (const staffId of menCoachStaffIds) {
    await prisma.draftCoachPoolEntry.create({ data: { draftEventId: DRAFT_EVENT_ID, divisionId: MEN_DIVISION_ID, staffId, sequence: seq++ } });
  }
  seq = 1;
  for (const staffId of womenCoachStaffIds) {
    await prisma.draftCoachPoolEntry.create({ data: { draftEventId: DRAFT_EVENT_ID, divisionId: WOMEN_DIVISION_ID, staffId, sequence: seq++ } });
  }
  console.log("Coach pool entries created:", menCoachStaffIds.length + womenCoachStaffIds.length);
}

main().finally(() => prisma.$disconnect());
