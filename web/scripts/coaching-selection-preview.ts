// Read-only preview of the Selection / Rotation Advisor (I2-b) against real data. Writes nothing.
//
// Usage: npx tsx scripts/coaching-selection-preview.ts <organizationId> <seasonId> "<focus club>" ["<opponent>"] [--json] [--no-plan]
//
// Built for I2's exit criterion - "3 real fixtures where the advisor's top 5 matches what the coach
// actually played (or the divergence is explainable and recorded)": point it at a played fixture's
// opponent and compare the printed ranking with the box score of that game.
//
// --no-plan runs the advisor with no game plan (the degraded path: form/availability/load only).
import { withOrganizationContext } from "../src/lib/tenant-context";
import { loadSeasonGameCores } from "../src/lib/analytics/game-analytics";
import { buildGamePlan } from "../src/lib/coaching/game-plan";
import type { PlayerMeta } from "../src/lib/coaching/player-development";
import { buildSelectionAdvice, type SelectionCandidate } from "../src/lib/coaching/selection";

async function main() {
  const [organizationId, seasonId, focusName, opponentName] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const asJson = process.argv.includes("--json");
  const noPlan = process.argv.includes("--no-plan");
  if (!organizationId || !seasonId || !focusName) {
    console.error('Usage: npx tsx scripts/coaching-selection-preview.ts <organizationId> <seasonId> "<focus club>" ["<opponent>"] [--json] [--no-plan]');
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
    const opponent = opponentName ? find(opponentName) : undefined;
    if (opponentName && !opponent) {
      console.log(`"${opponentName}" not found in ${games.length} games.`);
      return;
    }

    // Squad = every player registered to the club this season, not just those who appeared: a coach
    // needs to see the bench, and a player with no games is exactly what a rotation question is about.
    const roster = await tx.player.findMany({
      where: { seasonClubId: focus.seasonClubId, organizationId },
      select: { id: true, jerseyNumber: true, position: true, heightCm: true, athlete: { select: { firstName: true, lastName: true } } },
      orderBy: [{ jerseyNumber: "asc" }, { id: "asc" }],
    });
    const jersey = (n: number | null) => (n != null ? '#' + n + ' ' : '');
    const squad: SelectionCandidate[] = roster.map((p) => ({
      playerId: p.id,
      name: `${p.athlete.firstName} ${p.athlete.lastName}`,
      jerseyNumber: p.jerseyNumber,
      position: p.position,
      heightCm: p.heightCm,
    }));
    const meta = new Map<string, PlayerMeta>(roster.map((p) => [p.id, { position: p.position, heightCm: p.heightCm }]));

    const plan = opponent && !noPlan ? buildGamePlan(games, focus.seasonClubId, opponent.seasonClubId, meta) : null;
    const advice = buildSelectionAdvice({ games, squad, plan, starterCount: 5 });

    if (asJson) {
      console.log(JSON.stringify({ opponent: opponent?.name ?? null, ...advice }, null, 2));
      return;
    }

    console.log(`=== ${focus.name} rotation${opponent ? ` vs ${opponent.name}` : ""}  [${advice.status}] starterCount=${advice.starterCount}`);
    if (advice.insufficientReason) console.log(`  ${advice.insufficientReason}`);
    console.log(`  matchup state: ${advice.matchupState}   positions: ${advice.squadPositionCoverage?.usable}/${advice.squadPositionCoverage?.total} usable`);
    console.log("  #  player                     rec     overall  form  matchup  avail  load  games");
    advice.candidates.forEach((c, i) => {
      const name = `${jersey(c.jerseyNumber)}${c.name}`.padEnd(26);
      console.log(
        `  ${String(i + 1).padStart(2)} ${name} ${c.recommendation.padEnd(7)} ${String(c.overallScore).padStart(7)} ${String(c.formScore).padStart(5)} ${String(c.matchupScore ?? "-").padStart(8)} ${String(c.availabilityScore).padStart(6)} ${String(c.loadScore).padStart(5)} ${String(c.gamesPlayed).padStart(6)}`,
      );
      if (c.whyNot) console.log(`       why not the next: ${c.whyNot}`);
    });
    for (const n of advice.notes) console.log(`  note: ${n}`);
    if (advice.candidates[0]) {
      console.log("  evidence for the top candidate:");
      for (const e of advice.candidates[0].evidence) console.log(`    - ${e.metric}: ${e.playerValueLabel} [p${e.percentile}] (${e.baseline.label}, n=${e.baseline.peerCount}; ${e.sample.label}) ${e.confidence}`);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
