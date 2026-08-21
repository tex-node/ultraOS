import selectedPlayers from "../src/data/season-zero-selected-players.json";
import { prisma } from "../src/lib/prisma";

async function main() {
  const ids = selectedPlayers.map((p) => p.applicationId);
  const apps = await prisma.application.findMany({
    where: { id: { in: ids } },
    select: { id: true, provisionedAthleteId: true, provisionedPlayerId: true },
  });
  const athletes = await prisma.athlete.findMany({
    where: { id: { in: apps.map((a) => a.provisionedAthleteId!).filter(Boolean) } },
    select: { id: true, ultraAthleteId: true },
  });
  const players = await prisma.player.findMany({
    where: { id: { in: apps.map((a) => a.provisionedPlayerId!).filter(Boolean) } },
    select: { id: true, draftSelectionGroup: true, athlete: { select: { id: true } } },
  });

  const ultraIds = athletes.map((a) => a.ultraAthleteId).filter(Boolean);
  const uniqueUltraIds = new Set(ultraIds);

  const groupCounts: Record<string, number> = {};
  for (const p of selectedPlayers) {
    const key = `${p.division}_${p.draftSelectionGroup}_${p.mainDraftGroupNumber ?? "SEC"}`;
    groupCounts[key] = (groupCounts[key] ?? 0) + 1;
  }

  const seasonClubCheck = await prisma.player.findMany({
    where: { id: { in: apps.map((a) => a.provisionedPlayerId!).filter(Boolean) } },
    select: { seasonClubId: true },
  });

  console.log(JSON.stringify({
    totalUltraIds: ultraIds.length,
    uniqueUltraIds: uniqueUltraIds.size,
    duplicateUltraIds: ultraIds.length - uniqueUltraIds.size,
    groupCounts,
    seasonClubAssignmentsAmongSelected: seasonClubCheck.filter((p) => p.seasonClubId).length,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
