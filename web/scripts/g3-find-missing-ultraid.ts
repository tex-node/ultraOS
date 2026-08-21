import selectedPlayers from "../src/data/season-zero-selected-players.json";
import { prisma } from "../src/lib/prisma";

async function main() {
  const ids = selectedPlayers.map((p) => p.applicationId);
  const apps = await prisma.application.findMany({ where: { id: { in: ids } }, select: { id: true, provisionedAthleteId: true } });
  const athleteIds = apps.map((a) => a.provisionedAthleteId).filter((x): x is string => !!x);
  const athletes = await prisma.athlete.findMany({ where: { id: { in: athleteIds } }, select: { id: true, firstName: true, lastName: true, ultraAthleteId: true } });
  console.log(JSON.stringify(athletes.filter((a) => !a.ultraAthleteId), null, 2));
}
main().finally(() => prisma.$disconnect());
