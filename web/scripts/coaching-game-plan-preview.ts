// Read-only preview of C2 Game Plans against real data (ADR-011). Writes nothing.
//
// Usage: npx tsx scripts/coaching-game-plan-preview.ts <organizationId> <seasonId> "<focus club>" ["<opponent>"] [--json]
// Without an opponent, prints a plan for every other team in the season.
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { loadSeasonGameCores } from "../src/lib/analytics/game-analytics";
import { buildGamePlan } from "../src/lib/coaching/game-plan";
import type { PlayerMeta } from "../src/lib/coaching/player-development";

async function main() {
  const [organizationId, seasonId, focusName, opponentName] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const asJson = process.argv.includes("--json");
  if (!organizationId || !seasonId || !focusName) {
    console.error('Usage: npx tsx scripts/coaching-game-plan-preview.ts <organizationId> <seasonId> "<focus club>" ["<opponent>"] [--json]');
    process.exitCode = 1;
    return;
  }
  await withOrganizationContext(organizationId, async (tx) => {
    const games = await loadSeasonGameCores(seasonId, tx);
    const sides = games.flatMap((g) => [g.home, g.away]);
    const find = (n: string) => sides.find((s) => s.name === n || s.shortName === n);
    const focus = find(focusName);
    if (!focus) {
      console.log(`"${focusName}" not found in ${games.length} games.`);
      return;
    }
    const opponents = opponentName
      ? [find(opponentName)].filter((s): s is NonNullable<typeof s> => !!s)
      : [...new Map(sides.filter((s) => s.seasonClubId !== focus.seasonClubId).map((s) => [s.seasonClubId, s])).values()];
    const playerIds = [...new Set(games.flatMap((g) => g.players.map((p) => p.playerId)))];
    const players = await tx.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, position: true, heightCm: true } });
    const meta = new Map<string, PlayerMeta>(players.map((p) => [p.id, { position: p.position, heightCm: p.heightCm }]));

    for (const opp of opponents) {
      const plan = buildGamePlan(games, focus.seasonClubId, opp.seasonClubId, meta);
      if (!plan) continue;
      if (asJson) {
        console.log(JSON.stringify(plan, null, 2));
        continue;
      }
      const h = plan.headToHead;
      console.log(`=== ${plan.focus.name} vs ${plan.opponent.name}  (${plan.opponent.games} opp games, H2H ${h.focusWins}-${h.focusLosses}) ${plan.status}`);
      if (plan.insufficientReason) console.log(`  ${plan.insufficientReason}`);
      plan.keys.forEach((k, i) => {
        console.log(`  KEY ${i + 1} [${k.confidence}] ${k.title}`);
        console.log(`        ${k.rationale}`);
        for (const e of k.evidence) console.log(`        evidence: ${e.metric} ${e.value} (${e.baseline}; ${e.sample})`);
      });
      for (const a of plan.assignments) {
        console.log(`  GUARD ${a.threat.name} (${a.threat.ppg} PPG) -> ${a.defender?.name ?? "none"}: ${a.reasons.join(", ")}`);
      }
      const lg = plan.lateGame;
      if (lg) {
        for (const c of lg.closers) console.log(`  CLOSER ${c.role}: ${c.player.name} ${c.value} (${c.sample})`);
        if (lg.deny) console.log(`  LATE: deny ${lg.deny.name}`);
        if (lg.foulTarget) console.log(`  LATE: foul ${lg.foulTarget.name} (${lg.foulTarget.ftPct}, ${lg.foulTarget.sample})`);
        for (const n of lg.notes) console.log(`  note: ${n}`);
      }
      for (const k of plan.howTheyBeatUs) console.log(`  THEIR PATH: ${k.title} - ${k.rationale}`);
      console.log("");
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
