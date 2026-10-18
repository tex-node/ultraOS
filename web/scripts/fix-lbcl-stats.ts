// Prompt 1 (streak v4): apply the corrected LBCL box-score fields to the ALREADY-INGESTED games.
//
// The fixtures are FINAL in staging and production, and the ingest pipeline deliberately refuses to
// re-import a FINAL game (the duplicate guard). So this is a one-off data correction, not a new write
// path: it changes four fields on three existing PlayerStat rows to the values the corrected batch now
// holds, leaves every point total untouched (the game score and the team sums must not move), and writes
// an AuditLog entry per row so the change is attributable.
//
// It is idempotent by construction: each row asserts the OLD value before writing, so a second run says
// "already corrected" instead of silently changing something else.
//
//   npx tsx scripts/fix-lbcl-stats.ts --organization <orgId> --actor <userId>            # dry run
//   npx tsx scripts/fix-lbcl-stats.ts --organization <orgId> --actor <userId> --apply     # writes
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { writeAuditLog } from "../src/lib/audit";

type Batch = {
  games: {
    scheduledAt: string;
    sourceLabel: string;
    homeScore: number;
    awayScore: number;
    home: { clubName: string; players: Record<string, unknown>[] };
    away: { clubName: string; players: Record<string, unknown>[] };
  }[];
};

// field name in the batch -> field name on PlayerStat (they are the same for these four, but stated
// explicitly so a schema rename fails loudly here rather than silently doing nothing).
type Correction = { game: number; side: "home" | "away"; player: string; fields: { column: string; oldValue: number }[] };

const corrections: Correction[] = [
  // Game 19 (batch index 18): Square Team vs Lagos Raptors.
  { game: 19, side: "home", player: "Creon Okwuzu", fields: [{ column: "freeThrowsMade", oldValue: 1 }, { column: "freeThrowsAttempted", oldValue: 1 }] },
  { game: 19, side: "away", player: "Dele Ajigboye", fields: [{ column: "freeThrowsMade", oldValue: 2 }, { column: "threePointsAttempted", oldValue: 1 }] },
  // Game 20 (batch index 19): Campos vs Ogra Hoop Kings.
  { game: 20, side: "away", player: "Nnerive Peter", fields: [{ column: "twoPointsMade", oldValue: 1 }, { column: "twoPointsAttempted", oldValue: 1 }, { column: "fieldGoalsMade", oldValue: 1 }, { column: "fieldGoalsAttempted", oldValue: 1 }] },
];

const argv = process.argv.slice(2);
const arg = (name: string) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const APPLY = argv.includes("--apply");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: fix-lbcl-stats.ts --organization <orgId> --actor <userId> [--apply]");
  process.exit(1);
}

async function main() {
  const batch = JSON.parse(readFileSync("scripts/data/lbcl-2026-batch1.json", "utf8")) as Batch;
  console.log(`mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);

  await withOrganizationContext(ORGANIZATION!, async (tx) => {
    for (const correction of corrections) {
      const game = batch.games[correction.game - 1];
      if (!game) throw new Error(`game ${correction.game} missing from the batch`);
      const club = game[correction.side].clubName;
      const batchPlayer = game[correction.side].players.find((player) => player.fullName === correction.player);
      if (!batchPlayer) throw new Error(`game ${correction.game}: ${correction.player} not in the batch`);

      // Find the ingested fixture by its scheduled time (the import used it verbatim) and confirm the
      // club is on the expected SIDE - an away-team correction must not match a fixture where that club
      // happened to be at home.
      const fixture = await tx.fixture.findFirst({
        where: {
          organizationId: ORGANIZATION!,
          scheduledAt: new Date(game.scheduledAt),
          ...(correction.side === "home" ? { homeSeasonClub: { club: { name: club } } } : { awaySeasonClub: { club: { name: club } } }),
        },
        select: { id: true, status: true, homeScore: true, awayScore: true, homeSeasonClub: { select: { club: { select: { name: true } } } }, awaySeasonClub: { select: { club: { select: { name: true } } } } },
      });
      if (!fixture) {
        console.log(`game ${correction.game} ${correction.player}: no fixture at ${game.scheduledAt} with ${club} at home - SKIPPED`);
        continue;
      }

      const stat = await tx.playerStat.findFirst({
        where: { organizationId: ORGANIZATION!, game: { fixtureId: fixture.id }, player: { athlete: { firstName: correction.player.split(" ")[0], lastName: correction.player.split(" ").slice(1).join(" ") } } },
        select: {
          id: true,
          points: true,
          twoPointsMade: true,
          twoPointsAttempted: true,
          threePointsAttempted: true,
          fieldGoalsMade: true,
          fieldGoalsAttempted: true,
          freeThrowsMade: true,
          freeThrowsAttempted: true,
        },
      });
      if (!stat) {
        console.log(`game ${correction.game} ${correction.player}: PlayerStat not found (${fixture.homeSeasonClub?.club.name} vs ${fixture.awaySeasonClub?.club.name}) - SKIPPED`);
        continue;
      }

      const changes: Record<string, number> = {};
      for (const field of correction.fields) {
        const current = (stat as unknown as Record<string, number | null>)[field.column];
        const target = batchPlayer[field.column];
        if (typeof target !== "number") throw new Error(`${correction.player}.${field.column} is not numeric in the batch`);
        if (current === field.oldValue) changes[field.column] = target;
        else if (current === target) console.log(`  ${correction.player}.${field.column}: already ${target} (idempotent)`);
        else throw new Error(`${correction.player}.${field.column}: database has ${String(current)}, expected the old value ${field.oldValue} or the new ${target}`);
      }

      const label = `${correction.player} (${fixture.homeSeasonClub?.club.name} vs ${fixture.awaySeasonClub?.club.name}, ${new Date(game.scheduledAt).toISOString().slice(0, 10)})`;
      if (Object.keys(changes).length === 0) {
        console.log(`${label}: nothing to do`);
        continue;
      }
      console.log(`${label}: ${Object.entries(changes).map(([column, value]) => `${column} ${String((stat as unknown as Record<string, number | null>)[column])} -> ${String(value)}`).join(", ")}`);

      if (!APPLY) continue;
      await tx.playerStat.update({ where: { id: stat.id }, data: changes });
      await writeAuditLog(tx, {
        organizationId: ORGANIZATION!,
        userId: ACTOR!,
        action: "LBCL_BOX_SCORE_CORRECTED",
        entityType: "PlayerStat",
        entityId: stat.id,
        details: { player: correction.player, fixtureId: fixture.id, batchGame: correction.game, changes, reason: "arithmetic inconsistency found by the scoresheet checksums; see session.md 2026-10-18 streak v4 prompt 1" },
      });
    }

    // The corrections must NOT move any point total: report the team sums so the run is self-checking.
    for (const correction of corrections) {
      const game = batch.games[correction.game - 1];
      const fixture = await tx.fixture.findFirst({
        where: {
          organizationId: ORGANIZATION!,
          scheduledAt: new Date(game.scheduledAt),
          ...(correction.side === "home" ? { homeSeasonClub: { club: { name: game[correction.side].clubName } } } : { awaySeasonClub: { club: { name: game[correction.side].clubName } } }),
        },
        select: { id: true, homeScore: true, awayScore: true },
      });
      if (!fixture) continue;
      const stats = await tx.playerStat.findMany({ where: { organizationId: ORGANIZATION!, game: { fixtureId: fixture.id } }, select: { points: true, seasonClub: { select: { club: { select: { name: true } } } } } });
      const byClub = new Map<string, number>();
      for (const row of stats) byClub.set(row.seasonClub.club.name, (byClub.get(row.seasonClub.club.name) ?? 0) + row.points);
      const homeSum = [...byClub.entries()].find(([name]) => name === game.home.clubName)?.[1] ?? 0;
      const awaySum = [...byClub.entries()].find(([name]) => name === game.away.clubName)?.[1] ?? 0;
      console.log(`game ${correction.game}: player points ${homeSum}-${awaySum} vs fixture ${fixture.homeScore}-${fixture.awayScore} ${homeSum === fixture.homeScore && awaySum === fixture.awayScore ? "MATCH" : "MISMATCH"}`);
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
