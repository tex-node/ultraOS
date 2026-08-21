import selectedPlayers from "../src/data/season-zero-selected-players.json";
import { prisma } from "../src/lib/prisma";

async function main() {
  const ids = selectedPlayers.map((p) => p.applicationId);
  const apps = await prisma.application.findMany({
    where: { id: { in: ids } },
    select: { id: true, provisionedUserId: true, provisionedAthleteId: true, provisionedPlayerId: true, status: true },
  });
  const userIds = apps.map((a) => a.provisionedUserId).filter((x): x is string => !!x);
  const athleteIds = apps.map((a) => a.provisionedAthleteId).filter((x): x is string => !!x);
  const uniqueUsers = new Set(userIds);
  const uniqueAthletes = new Set(athleteIds);
  const athletes = await prisma.athlete.findMany({ where: { id: { in: athleteIds } }, select: { ultraAthleteId: true } });
  const withUltraId = athletes.filter((a) => a.ultraAthleteId).length;
  const roleAssignments = await prisma.userRoleAssignment.findMany({ where: { userId: { in: userIds }, role: "PLAYER", revokedAt: null } });

  console.log(JSON.stringify({
    selected: selectedPlayers.length,
    withUser: userIds.length,
    uniqueUsers: uniqueUsers.size,
    withAthlete: athleteIds.length,
    uniqueAthletes: uniqueAthletes.size,
    withPlayer: apps.filter((a) => a.provisionedPlayerId).length,
    withUltraId,
    playerRoleAssignments: roleAssignments.length,
    allApproved: apps.every((a) => a.status === "APPROVED"),
    notProvisioned: apps.filter((a) => !a.provisionedAthleteId).map((a) => a.id),
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
