import { prisma } from "../src/lib/prisma";

async function main() {
  const stats = await prisma.playerStat.findMany({
    where: { game: { status: "FINAL" }, didNotPlay: false },
    select: { points: true, rebounds: true, assists: true, steals: true, blocks: true, fieldGoalsMade: true, fieldGoalsAttempted: true },
  });
  const teamStats = await prisma.teamStat.findMany({
    select: { points: true, rebounds: true, benchPoints: true, pointsInPaint: true },
  });

  function dist(arr: number[]) {
    const sorted = [...arr].sort((a, b) => b - a);
    return { max: sorted[0], top5: sorted.slice(0, 5), count: arr.length };
  }

  console.log(JSON.stringify({
    points: dist(stats.map((s) => s.points)),
    rebounds: dist(stats.map((s) => s.rebounds)),
    assists: dist(stats.map((s) => s.assists)),
    steals: dist(stats.map((s) => s.steals)),
    blocks: dist(stats.map((s) => s.blocks)),
    teamScore: dist(teamStats.map((t) => t.points)),
    teamRebounds: dist(teamStats.map((t) => t.rebounds ?? 0)),
    teamBench: dist(teamStats.filter((t) => t.benchPoints != null).map((t) => t.benchPoints as number)),
    teamPaint: dist(teamStats.filter((t) => t.pointsInPaint != null).map((t) => t.pointsInPaint as number)),
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
