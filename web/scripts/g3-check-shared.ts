import selectedPlayers from "../src/data/season-zero-selected-players.json";
import { prisma } from "../src/lib/prisma";

async function main() {
  const ids = selectedPlayers.map((p) => p.applicationId);
  const apps = await prisma.application.findMany({
    where: { id: { in: ids } },
    select: { id: true, provisionedUserId: true, provisionedAthleteId: true, provisionedPlayerId: true },
  });
  const byUser = new Map<string, string[]>();
  const byAthlete = new Map<string, string[]>();
  for (const a of apps) {
    if (a.provisionedUserId) byUser.set(a.provisionedUserId, [...(byUser.get(a.provisionedUserId) ?? []), a.id]);
    if (a.provisionedAthleteId) byAthlete.set(a.provisionedAthleteId, [...(byAthlete.get(a.provisionedAthleteId) ?? []), a.id]);
  }
  const sharedUsers = [...byUser.entries()].filter(([, list]) => list.length > 1);
  const sharedAthletes = [...byAthlete.entries()].filter(([, list]) => list.length > 1);
  console.log("Shared users:", JSON.stringify(sharedUsers, null, 2));
  console.log("Shared athletes:", JSON.stringify(sharedAthletes, null, 2));

  for (const [, appIds] of [...sharedUsers, ...sharedAthletes]) {
    for (const id of appIds) {
      const app = await prisma.application.findUnique({ where: { id }, select: { id: true, submittedData: true, provisionedUserId: true, provisionedAthleteId: true, provisionedPlayerId: true } });
      const data = app?.submittedData as Record<string, unknown>;
      console.log(id, "->", data?.fullName, data?.email, "userId:", app?.provisionedUserId, "athleteId:", app?.provisionedAthleteId, "playerId:", app?.provisionedPlayerId);
    }
  }
}
main().finally(() => prisma.$disconnect());
