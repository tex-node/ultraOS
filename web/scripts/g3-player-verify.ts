import selectedPlayers from "../src/data/season-zero-selected-players.json";
import { prisma } from "../src/lib/prisma";

async function main() {
  const ids = selectedPlayers.map((p) => p.applicationId);
  const apps = await prisma.application.findMany({
    where: { id: { in: ids } },
    select: { id: true, provisionedUserId: true, provisionedAthleteId: true, provisionedPlayerId: true, status: true },
  });
  const withUser = apps.filter((a) => a.provisionedUserId).length;
  const withAthlete = apps.filter((a) => a.provisionedAthleteId).length;
  const withPlayer = apps.filter((a) => a.provisionedPlayerId).length;
  const notProvisioned = apps.filter((a) => !a.provisionedAthleteId).map((a) => a.id);

  const athleteIds = apps.map((a) => a.provisionedAthleteId).filter((x): x is string => !!x);
  const athletes = await prisma.athlete.findMany({ where: { id: { in: athleteIds } }, select: { ultraAthleteId: true } });
  const withUltraId = athletes.filter((a) => a.ultraAthleteId).length;

  console.log(JSON.stringify({
    selected: selectedPlayers.length,
    withUser, withAthlete, withPlayer, withUltraId,
    notProvisioned,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
