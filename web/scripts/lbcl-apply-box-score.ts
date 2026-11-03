import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

// Apply a validated box-score batch to the game that already carries the scoreline.
//
// WHY THIS EXISTS. The external-stats importer resolves a player by name against the roster and silently skips a row it
// cannot resolve, so a sheet that spells a person differently from the roster ("Obasana Sunday" vs "Sunday Obasanya") loses
// that player's line - and reports success. For a retrospective backfill the identity is not in doubt: the sheet and the
// roster agree on the SHIRT, which is unique within a club, so this script resolves by jersey number first, name second,
// and creates only when neither matches. It writes the same rows the importer would (PlayerStat per player, both teams),
// and refuses to run on a game that already has statistics, so it cannot double-write.
//
//   npx tsx scripts/lbcl-apply-box-score.ts <batch.json>            # dry run
//   npx tsx scripts/lbcl-apply-box-score.ts <batch.json> --apply    # write
type PlayerRow = {
  fullName: string;
  jerseyNumber: number | null;
  didNotPlay?: boolean;
  minutesPlayed: number;
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  twoPointsMade: number;
  twoPointsAttempted: number;
  threePointsMade: number;
  threePointsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
  foulsCommitted: number;
  foulsDrawn: number;
  plusMinus: number;
  efficiency: number;
};
type Team = { clubShortName: string; players: PlayerRow[]; totals: { points: number; rebounds: number; assists: number; turnovers: number; fouls: number }; teamAggregates?: { rebounds?: number } };
type Game = { scheduledAt: string; homeScore: number; awayScore: number; home: Team; away: Team; playerGender: "MALE" | "FEMALE" };
type Batch = { organization: { organizationId: string }; games: Game[] };

const apply = process.argv.includes("--apply");
const path = process.argv[2];
if (!path) {
  console.error("usage: lbcl-apply-box-score.ts <batch.json> [--apply]");
  process.exit(2);
}
const batch = JSON.parse(readFileSync(path, "utf8")) as Batch;
const organizationId = batch.organization.organizationId;

async function main() {
  for (const game of batch.games) {
    await withOrganizationContext(organizationId, async (tx) => {
      const fixture = await tx.fixture.findFirst({
        where: { organizationId, scheduledAt: new Date(game.scheduledAt) },
        select: { id: true, homeSeasonClubId: true, awaySeasonClubId: true, homeScore: true, awayScore: true, game: { select: { id: true } } },
      });
      if (!fixture?.game) throw new Error(`no fixture+game at ${game.scheduledAt}`);
      const gameId = fixture.game.id;
      const existing = await tx.playerStat.count({ where: { gameId } });
      if (existing > 0) throw new Error(`game ${gameId} already has ${existing} player rows - refusing to double-write`);

      for (const [side, team, clubId] of [
        ["home", game.home, fixture.homeSeasonClubId],
        ["away", game.away, fixture.awaySeasonClubId],
      ] as const) {
        if (!clubId) throw new Error(`${side} fixture has no season club - cannot attribute player rows`);
        const roster = await tx.player.findMany({
          where: { organizationId, seasonClubId: clubId },
          select: { id: true, jerseyNumber: true, athlete: { select: { firstName: true, lastName: true } } },
        });
        let written = 0;
        for (const row of team.players) {
          const normalize = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
          const byJersey = row.jerseyNumber === null ? undefined : roster.find((p) => p.jerseyNumber === row.jerseyNumber);
          const byName = roster.find(
            (p) => normalize(`${p.athlete.firstName}${p.athlete.lastName}`) === normalize(row.fullName)
              || normalize(`${p.athlete.lastName}${p.athlete.firstName}`) === normalize(row.fullName),
          );
          const player = byJersey ?? byName;
          if (!player) {
            console.log(`  ${side}: no roster match for ${row.fullName} (#${row.jerseyNumber ?? "-"}) - row skipped`);
            continue;
          }
          console.log(`  ${side} #${row.jerseyNumber ?? "-"} ${row.fullName} -> ${player.athlete.firstName} ${player.athlete.lastName}${byJersey ? " (by shirt)" : " (by name)"} · ${row.points} pts`);
          if (apply) {
            await tx.playerStat.create({
              data: {
                organizationId,
                gameId,
                playerId: player.id,
                seasonClubId: clubId,
                points: row.points,
                rebounds: row.offensiveRebounds + row.defensiveRebounds,
                assists: row.assists,
                steals: row.steals,
                blocks: row.blocks,
                turnovers: row.turnovers,
                fouls: row.foulsCommitted,
                minutesPlayed: row.minutesPlayed,
                fieldGoalsMade: row.fieldGoalsMade,
                fieldGoalsAttempted: row.fieldGoalsAttempted,
                twoPointsMade: row.twoPointsMade,
                twoPointsAttempted: row.twoPointsAttempted,
                threePointsMade: row.threePointsMade,
                threePointsAttempted: row.threePointsAttempted,
                freeThrowsMade: row.freeThrowsMade,
                freeThrowsAttempted: row.freeThrowsAttempted,
                offensiveRebounds: row.offensiveRebounds,
                defensiveRebounds: row.defensiveRebounds,
                foulsDrawn: row.foulsDrawn,
                plusMinus: row.plusMinus,
                efficiency: row.efficiency,
                didNotPlay: row.didNotPlay ?? false,
                statSource: "FIBA_LIVESTATS_PDF_IMPORT",
              },
            });
          }
          written += 1;
        }
        console.log(`  ${side}: ${written}/${team.players.length} rows ${apply ? "written" : "would be written"} · printed ${team.totals.points}`);
      }
      await tx.fixture.update({ where: { id: fixture.id }, data: { status: "FINAL" } });
    });
  }
  console.log(apply ? "\napplied" : "\ndry run (pass --apply to write)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
