import selectedPlayers from "../src/data/season-zero-selected-players.json";
import { AllocationStatus, DraftEventOperatingMode, DraftPickStatus, DraftStatus, DraftTier } from "../src/generated/prisma/enums";
import {
  confirmSecondaryDraftPick,
  markSecondaryDraftPickRevealing,
  publicSecondaryDraftState,
  reserveSecondaryDraftPick,
  resetSecondaryDraftRehearsal,
  revealSecondaryDraftPick,
} from "../src/lib/draft-events";
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const DRAFT_EVENT_ID = "cmsmoolbl0000rckk9wr5cezj";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const MEN_DIVISION_ID = "cmqfqpnke0003lgkkkgev3oyt";
const MEN_CLUB_IDS = [
  "cmqfqpnod000dlgkku9sqb9nm", // Apex
  "cmqfqpnpm000plgkk6fofe078", // Surge
  "cmqfqpnm20007lgkk0nfwj431", // Vortex
  "cmqfqpnoz000jlgkkv1i612md", // Flux
];

async function main() {
  const event = await prisma.draftEvent.findUniqueOrThrow({ where: { id: DRAFT_EVENT_ID } });
  console.log("DraftEvent operatingMode:", event.operatingMode, "status:", event.status);
  if (event.operatingMode !== DraftEventOperatingMode.REHEARSAL) throw new Error("Refusing: DraftEvent is not in REHEARSAL mode.");

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.draft.create({
      data: {
        name: "Season Zero Secondary Draft (MEN)",
        seasonId: SEASON_ID,
        divisionId: MEN_DIVISION_ID,
        tier: DraftTier.SECONDARY,
        status: DraftStatus.LIVE,
        draftEventId: DRAFT_EVENT_ID,
      },
    });
    await writeAuditLog(tx, { action: "SECONDARY_DRAFT_CREATED", entityId: created.id, entityType: "Draft", userId: ACTOR_ID, details: { draftEventId: DRAFT_EVENT_ID, divisionId: MEN_DIVISION_ID } });
    return created;
  });
  console.log("Secondary Draft created:", draft.id, "(inherits operatingMode from DraftEvent =", event.operatingMode, ")");

  const secondary = selectedPlayers.filter((p) => p.draftSelectionGroup === "SECONDARY_DRAFT");
  console.log(`\n${secondary.length} secondary-draft players to pick.\n`);

  const apps = await prisma.application.findMany({ where: { id: { in: secondary.map((p) => p.applicationId) } }, select: { id: true, provisionedPlayerId: true } });
  const playerIdByAppId = new Map(apps.map((a) => [a.id, a.provisionedPlayerId!]));

  for (let i = 0; i < secondary.length; i++) {
    const round = i + 1;
    const p = secondary[i];
    const playerId = playerIdByAppId.get(p.applicationId);
    if (!playerId) throw new Error(`No provisioned player for ${p.applicationId}`);
    const seasonClubId = MEN_CLUB_IDS[i % MEN_CLUB_IDS.length];

    const pick = await reserveSecondaryDraftPick({ draftId: draft.id, playerId, seasonClubId, round, userId: ACTOR_ID });

    const stateReserved = await publicSecondaryDraftState(draft.id);
    const reservedPick = stateReserved?.picks?.find((pk: { id: string }) => pk.id === pick.id);
    console.log(`RESERVE pick #${i + 1}: ${pick.id} — public payload: ${JSON.stringify(reservedPick)}`);

    await markSecondaryDraftPickRevealing(pick.id, ACTOR_ID);
    await revealSecondaryDraftPick(pick.id, ACTOR_ID);
    await confirmSecondaryDraftPick(pick.id, ACTOR_ID);
    console.log(`  CONFIRM pick #${i + 1}: done (player=${p.name})`);
  }

  console.log("\n--- Verifying isolation ---");
  const officialCount = await prisma.player.count({ where: { id: { in: [...playerIdByAppId.values()] }, seasonClubId: { not: null } } });
  console.log("Official SeasonClub writes among secondary players (must be 0):", officialCount);
  const liveAllocations = await prisma.draftAllocation.count({ where: { operatingMode: DraftEventOperatingMode.LIVE, status: AllocationStatus.CONFIRMED } });
  console.log("LIVE DraftAllocations (must be 0):", liveAllocations);

  console.log("\n--- Resetting secondary draft rehearsal ---");
  await resetSecondaryDraftRehearsal(draft.id, ACTOR_ID, "Final production Draft Day rehearsal completed successfully.");
  const remaining = await prisma.draftPick.count({ where: { draftId: draft.id } });
  console.log("DraftPick rows remaining after reset (must be 0):", remaining);
}

main().finally(() => prisma.$disconnect());
