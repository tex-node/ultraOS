// Read-only preview of C1 Development Plans against real data (ADR-011). Writes nothing.
//
// Usage: npx tsx scripts/coaching-development-preview.ts <organizationId> <seasonId> "<club name>" [--json]
// Example (LBCL): npx tsx scripts/coaching-development-preview.ts <lbclOrgId> <2026SeasonId> "Ultra Basketball"
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { loadSeasonGameCores } from "../src/lib/analytics/game-analytics";
import { buildSquadDevelopmentPlans, type PlayerMeta } from "../src/lib/coaching/player-development";

async function main() {
  const [organizationId, seasonId, clubName] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const asJson = process.argv.includes("--json");
  if (!organizationId || !seasonId || !clubName) {
    console.error('Usage: npx tsx scripts/coaching-development-preview.ts <organizationId> <seasonId> "<club name>" [--json]');
    process.exitCode = 1;
    return;
  }
  await withOrganizationContext(organizationId, async (tx) => {
    const games = await loadSeasonGameCores(seasonId, tx);
    const club = games.flatMap((g) => [g.home, g.away]).find((s) => s.name === clubName || s.shortName === clubName);
    if (!club) {
      console.log(`"${clubName}" not found in ${games.length} games of season ${seasonId}.`);
      return;
    }
    const playerIds = [...new Set(games.flatMap((g) => g.players.map((p) => p.playerId)))];
    const players = await tx.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, position: true, heightCm: true } });
    const meta = new Map<string, PlayerMeta>(players.map((p) => [p.id, { position: p.position, heightCm: p.heightCm }]));
    const plans = buildSquadDevelopmentPlans(games, club.seasonClubId, meta);
    if (asJson) {
      console.log(JSON.stringify(plans, null, 2));
      return;
    }
    console.log(`${club.name}: ${plans.length} players, ${games.length} games in season\n`);
    for (const p of plans) {
      console.log(`${p.jerseyNumber ? `#${p.jerseyNumber} ` : ""}${p.name} (${p.position ?? "?"} -> ${p.positionGroup}), ${p.gamesPlayed} GP, ${p.status}`);
      for (const f of p.focusAreas) {
        const e = f.evidence;
        console.log(`  FOCUS ${f.label}: ${e.playerValueLabel} vs ${e.baseline.label} median ${e.baseline.medianLabel} (p${e.percentile}, ${e.sample.label}, ${e.confidence}) trend ${f.trend.direction}`);
        console.log(`        ${f.target.statement}`);
        console.log(`        drills: ${f.drills.map((d) => d.name).join(" | ")}`);
      }
      for (const s of p.strengths) console.log(`  STRENGTH ${s.label}: ${s.evidence.playerValueLabel} (p${s.evidence.percentile})`);
      const insufficient = p.readings.filter((r) => r.status === "INSUFFICIENT_DATA").map((r) => r.label);
      if (insufficient.length) console.log(`  insufficient data: ${insufficient.join(", ")}`);
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
