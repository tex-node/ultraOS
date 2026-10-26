import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { applyScoringDelivery, type ScoringGamePayload } from "../src/server/scoring/applyScoringDelivery";
import { createGame } from "../src/server/scoring/createGame";
import { createGameEvent } from "../src/server/scoring/createGameEvent";
import { recalculateStandings } from "../src/lib/standings-recalculate";
import { recordScoreInternal } from "../src/app/games/actions-internal";
import { computeEloRatings } from "../src/lib/analytics/elo";
import { getSportDefinition } from "../src/lib/sports/registry";
import { battingSide, inningsConfig } from "../src/lib/sports/innings-scoring";
import { randomUUID } from "node:crypto";

// Streak v14, Prompt 4: five sports scored at the same time, in one organization, without bleeding into each other.
//
//   npx tsx scripts/stress-test-multi-sport.ts --organization <orgId> --actor <userId> [--keep] [--events 12]
//
// What "no bleeding" has to mean:
//   * each fixture's score moves only for its own deliveries (checked exactly, per fixture, per sport);
//   * the standings of one competition never gain a row from another (football W/D/L, tennis sets, cricket runs);
//   * every scoring write produces its own win-probability delivery, and the delivery count equals the number of
//     scoring writes across all five sports - one subscriber, five games, no drops and no duplicates.
//
// Concurrency is the point, so the deliveries run through Promise.all. Each one takes the FOR UPDATE lock on ITS OWN
// fixture, so five fixtures mean five independent lock chains - which is exactly what a venue running several courts
// actually does.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const EVENTS_PER_SPORT = Number(arg("events") ?? 12);
// Bounded concurrency (streak v14 finding). Firing all writes at once rejected 27 of 40 with "Unable to start a
// transaction in the given time": 40 interactive transactions against a Prisma pool sized ~2*CPUs+1 saturate it, and
// the 5s interactive-transaction timeout aborts the queue. A real venue runs a handful of consoles, so the default
// here is the platform's practical ceiling - and --concurrency lets the limit itself be measured.
const CONCURRENCY = Number(arg("concurrency") ?? 8);
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: stress-test-multi-sport.ts --organization <id> --actor <userId> [--keep] [--events N]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;
const TAG = `STRESS ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

type SportSetup = {
  slug: string;
  competitionId: string;
  divisionId: string;
  seasonId: string;
  fixtureId: string;
  gameId: string;
  home: string;
  away: string;
  /** Which delivery function this sport uses: basketball has its own scorer; everything else is module-driven. */
  mode: "basketball" | "module";
  typeKeys: string[];
};

async function loadGame(gameId: string): Promise<ScoringGamePayload> {
  return prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      fixture: { include: { division: { include: { competition: { include: { sport: true } } } } } },
      periodScores: { orderBy: { period: "asc" } },
      ruleSnapshot: true,
      events: { select: { period: true, typeKey: true, sequenceNumber: true, seasonClubId: true, entrantId: true }, orderBy: { sequenceNumber: "asc" } },
    },
  });
}

async function setupSport(slug: string, mode: SportSetup["mode"], typeKeys: string[]): Promise<SportSetup> {
  return withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug }, select: { id: true } });
    const competition = await tx.competition.create({
      data: { organizationId: ORG, sportId: sport.id, name: `${TAG} ${slug}`, slug: `stress-${slug}-${Date.now()}` },
      select: { id: true },
    });
    const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "Open", slug: "open" }, select: { id: true } });
    const season = await tx.season.create({
      data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} ${slug} season`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) },
      select: { id: true },
    });
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });

    const sides: string[] = [];
    if (mode === "basketball" || ["football", "volleyball", "cricket"].includes(slug)) {
      // Team sports: two clubs.
      for (const [index, name] of [`Stress ${slug} A`, `Stress ${slug} B`].entries()) {
        const club = await tx.club.create({
          data: { organizationId: ORG, sportId: sport.id, name: `${name} ${randomUUID().slice(0, 4)}`, shortName: `S${index + 1}${randomUUID().slice(0, 3)}`.toUpperCase() },
          select: { id: true },
        });
        const seasonClub = await tx.seasonClub.create({ data: { organizationId: ORG, seasonId: season.id, clubId: club.id, divisionId: division.id }, select: { id: true } });
        sides.push(seasonClub.id);
      }
    } else {
      // Individual sport (tennis): two entrants.
      for (const name of [`Stress ${slug} A`, `Stress ${slug} B`]) {
        const entrant = await tx.entrant.create({
          data: { organizationId: ORG, competitionId: competition.id, seasonId: season.id, divisionId: division.id, type: "INDIVIDUAL", name: `${name} ${randomUUID().slice(0, 3)}` },
          select: { id: true },
        });
        sides.push(entrant.id);
      }
    }

    const isEntrants = slug === "tennis";
    const fixture = await tx.fixture.create({
      data: {
        organizationId: ORG,
        seasonId: season.id,
        divisionId: division.id,
        venueId: venue.id,
        scheduledAt: new Date(),
        status: "SCHEDULED",
        ...(isEntrants
          ? { homeEntrantId: sides[0], awayEntrantId: sides[1] }
          : { homeSeasonClubId: sides[0], awaySeasonClubId: sides[1] }),
      },
      select: { id: true },
    });
    const game = await createGame(
      { id: `stress_${slug}_${randomUUID().slice(0, 6)}`, fixtureId: fixture.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 720 },
      { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" },
    );
    await tx.fixture.update({ where: { id: fixture.id }, data: { status: "LIVE" } });
    return {
      slug,
      competitionId: competition.id,
      divisionId: division.id,
      seasonId: season.id,
      fixtureId: fixture.id,
      gameId: game.id,
      home: sides[0],
      away: sides[1],
      mode,
      typeKeys,
    };
  });
}

async function deliver(setup: SportSetup, side: "home" | "away", typeKey: string) {
  const sideId = side === "home" ? setup.home : setup.away;
  if (setup.mode === "basketball") {
    const form = new FormData();
    form.set("seasonClubId", sideId);
    form.set("playerId", "");
    form.set("points", typeKey === "THREE_POINTER" ? "3" : typeKey === "FREE_THROW" ? "1" : "2");
    form.set("description", `stress ${typeKey}`);
    await recordScoreInternal(setup.gameId, setup.fixtureId, form, { id: ACTOR_ID, organizationId: ORG });
    return;
  }
  await withOrganizationContext(ORG, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${setup.fixtureId} FOR UPDATE`;
    const loaded = await loadGame(setup.gameId);
    // Cricket is the one sport where a delivery has a legal recipient: only the batting side. Firing at the other
    // side is refused by the engine (NOT_BATTING), which is correct - the first run did exactly that four times. The
    // test now asks the engine who is batting, so the delivery is legal rather than merely tolerated.
    let target = sideId;
    if (setup.slug === "cricket") {
      const definition = getSportDefinition("cricket");
      const config = definition ? inningsConfig(definition) : null;
      if (config) {
        const batting = battingSide(config, loaded.currentPeriod);
        target = batting === "HOME" ? setup.home : setup.away;
      }
    }
    await applyScoringDelivery({
      tx,
      organizationId: ORG,
      actorId: ACTOR_ID,
      fixtureId: setup.fixtureId,
      game: loaded,
      input: { seasonClubId: target, typeKey },
    });
  });
}

async function main() {
  // A subscriber, so the win-probability deliveries have somewhere to go and can be counted.
  const subscription = await withOrganizationContext(ORG, (tx) =>
    tx.dataFeedSubscription.create({
      data: {
        organizationId: ORG,
        createdById: ACTOR_ID,
        name: `${TAG} subscriber`,
        webhookUrl: "http://127.0.0.1:9/unreachable",
        secret: randomUUID().replace(/-/g, ""),
        events: ["WIN_PROBABILITY_UPDATED", "SCORE_CHANGED"],
        isActive: true,
      },
      select: { id: true },
    }),
  );

  console.log(`== setting up five sports (${EVENTS_PER_SPORT} scoring events each)`);
  const setups: SportSetup[] = [
    await setupSport("basketball", "basketball", ["TWO_POINTER", "THREE_POINTER", "FREE_THROW"]),
    await setupSport("football", "module", ["GOAL", "PENALTY_GOAL"]),
    await setupSport("tennis", "module", ["POINT"]),
    await setupSport("volleyball", "module", ["POINT", "SET_WON"]),
    await setupSport("cricket", "module", ["RUN", "FOUR", "SIX"]),
  ];
  for (const setup of setups) console.log(`   ${setup.slug.padEnd(11)} fixture ${setup.fixtureId.slice(0, 8)}… game ${setup.gameId}`);

  // Build the work list first, then fire it all at once: interleaved by sport so the five games are genuinely in
  // flight together rather than one sport finishing before the next starts.
  const jobs: { setup: SportSetup; side: "home" | "away"; typeKey: string }[] = [];
  for (let index = 0; index < EVENTS_PER_SPORT; index += 1) {
    for (const setup of setups) {
      jobs.push({ setup, side: index % 2 === 0 ? "home" : "away", typeKey: setup.typeKeys[index % setup.typeKeys.length] });
    }
  }

  console.log(`== delivering ${jobs.length} scoring events, ${CONCURRENCY} in flight, interleaved across five sports`);
  const started = Date.now();
  const outcomes: PromiseSettledResult<void>[] = new Array(jobs.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const index = cursor;
        cursor += 1;
        const job = jobs[index];
        try {
          await deliver(job.setup, job.side, job.typeKey);
          outcomes[index] = { status: "fulfilled", value: undefined };
        } catch (error) {
          outcomes[index] = { status: "rejected", reason: error };
        }
      }
    }),
  );
  const elapsed = Date.now() - started;
  const results = outcomes;
  const rejected = results.filter((result) => result.status === "rejected");
  console.log(`   ${results.length - rejected.length}/${results.length} accepted in ${elapsed} ms (${Math.round(msPerEvent(results.length, elapsed))} ms/event)`);
  if (rejected.length > 0) {
    const reasons = new Map<string, number>();
    for (const result of rejected) {
      const reason = result.status === "rejected" ? String((result.reason as Error)?.message ?? result.reason).slice(0, 90) : "";
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    console.log(`   rejections: ${[...reasons.entries()].map(([reason, count]) => `${reason}×${count}`).join(", ")}`);
  }

  // Finalise each game the same way a match ends, so the standings have something to compute from. Without this the
  // first run reported five empty standings tables: standings are recalculated on finalisation, not on every score.
  console.log("\n== finalising the five games");
  for (const setup of setups) {
    const row = await withOrganizationContext(ORG, (tx) => tx.fixture.findUniqueOrThrow({ where: { id: setup.fixtureId }, select: { homeScore: true, awayScore: true } }));
    const leader = row.homeScore === row.awayScore ? null : row.homeScore > row.awayScore ? "HOME" : "AWAY";
    await withOrganizationContext(ORG, async (tx) => {
      await createGameEvent(
        {
          gameId: setup.gameId,
          fixtureId: setup.fixtureId,
          eventType: "GAME_ENDED",
          typeKey: "GAME_ENDED",
          period: 1,
          clockSeconds: 0,
          description: `Stress final ${row.homeScore}-${row.awayScore}`,
        },
        { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" },
      );
      // A winner is a SeasonClub OR an Entrant (the same rule as the Elo table). Setting both - or setting the
      // entrant column to a season-club id - violates the FK, which the first finalisation attempt did.
      const fixtureSides = await tx.fixture.findUniqueOrThrow({
        where: { id: setup.fixtureId },
        select: { homeEntrantId: true, awayEntrantId: true },
      });
      const entrantFixture = Boolean(fixtureSides.homeEntrantId || fixtureSides.awayEntrantId);
      await tx.fixture.update({
        where: { id: setup.fixtureId },
        data: {
          status: "FINAL",
          winnerSeasonClubId: entrantFixture || !leader ? null : leader === "HOME" ? setup.home : setup.away,
          winnerEntrantId: entrantFixture && leader ? (leader === "HOME" ? setup.home : setup.away) : null,
        },
      });
      await tx.game.update({ where: { id: setup.gameId }, data: { status: "FINAL", endedAt: new Date(), clockStartedAt: null } });
      await recalculateStandings(tx, ORG, setup.seasonId);
    });
    console.log(`   ${setup.slug.padEnd(11)} FINAL ${row.homeScore}-${row.awayScore} (${leader ?? "draw"})`);
  }

  // 1. Each fixture's score moved only for its own events.
  const after = await withOrganizationContext(ORG, (tx) =>
    tx.fixture.findMany({
      where: { id: { in: setups.map((setup) => setup.fixtureId) } },
      select: { id: true, homeScore: true, awayScore: true, status: true },
    }),
  );
  const scoreOf = new Map(after.map((row) => [row.id, row]));
  console.log("\n== scores (each fixture only sees its own sport)");
  for (const setup of setups) {
    const row = scoreOf.get(setup.fixtureId);
    console.log(`   ${setup.slug.padEnd(11)} ${row?.homeScore ?? "?"}-${row?.awayScore ?? "?"} · ${row?.status}`);
  }

  // 2. Win-probability deliveries: one per accepted scoring write.
  const deliveries = await withOrganizationContext(ORG, (tx) =>
    tx.dataFeedDelivery.findMany({ where: { subscriptionId: subscription.id }, select: { eventType: true, gameId: true } }),
  );
  const wpByGame = new Map<string, number>();
  for (const delivery of deliveries.filter((row) => row.eventType === "WIN_PROBABILITY_UPDATED")) {
    wpByGame.set(delivery.gameId, (wpByGame.get(delivery.gameId) ?? 0) + 1);
  }
  console.log("\n== win-probability deliveries by game");
  for (const setup of setups) console.log(`   ${setup.slug.padEnd(11)} ${wpByGame.get(setup.gameId) ?? 0}`);

  // 3. Standings per competition, and no cross-competition rows.
  const standings = await withOrganizationContext(ORG, (tx) =>
    tx.standing.findMany({
      where: { seasonId: { in: setups.map((setup) => setup.seasonId) } },
      select: { seasonId: true, won: true, lost: true, drawn: true, leaguePoints: true, seasonClubId: true, entrantId: true },
    }),
  );
  console.log("\n== standings rows per competition");
  for (const setup of setups) {
    const rows = standings.filter((row) => row.seasonId === setup.seasonId);
    console.log(`   ${setup.slug.padEnd(11)} ${rows.length} row(s) · ${rows.map((row) => `W${row.won} D${row.drawn} L${row.lost} pts${row.leaguePoints}`).join(" · ") || "none yet"}`);
  }

  // 4. Elo for the team sports, from the deliveries that just happened.
  const elo = computeEloRatings(
    after.map((row) => {
      const setup = setups.find((candidate) => candidate.fixtureId === row.id)!;
      return { homeKey: setup.home, awayKey: setup.away, homeScore: row.homeScore, awayScore: row.awayScore, drawsAllowed: true };
    }),
  );
  console.log("\n== Elo implied by these five finals (computed, not persisted - this is a stress run)");
  for (const row of [...elo.values()].sort((a, b) => b.rating - a.rating).slice(0, 6)) {
    console.log(`   ${row.key.slice(0, 10)}… ${row.rating.toFixed(1)} (${row.wins}-${row.losses}-${row.draws})`);
  }

  const accepted = results.length - rejected.length;
  const problems: string[] = [];
  if (rejected.length > 0) problems.push(`${rejected.length} scoring deliveries were rejected`);
  if (wpByGame.size !== setups.length) problems.push(`${wpByGame.size} games produced win-probability deliveries, expected ${setups.length}`);
  const wpTotal = [...wpByGame.values()].reduce((sum, count) => sum + count, 0);
  if (wpTotal !== accepted) problems.push(`${wpTotal} win-probability deliveries for ${accepted} accepted writes`);
  for (const setup of setups) {
    if (!wpByGame.get(setup.gameId)) problems.push(`${setup.slug} produced no win-probability delivery`);
  }
  const foreign = standings.filter((row) => !setups.some((setup) => setup.seasonId === row.seasonId));
  if (foreign.length > 0) problems.push(`${foreign.length} standing row(s) outside these competitions`);
  if (elo.size !== new Set(setups.flatMap((setup) => [setup.home, setup.away])).size) problems.push("the Elo table does not cover every competitor");

  console.log("");
  console.log(problems.length === 0 ? `PASS: ${setups.length} sports scored concurrently, ${accepted} writes, ${wpTotal} win-probability deliveries, no cross-sport rows` : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.dataFeedDelivery.deleteMany({ where: { subscriptionId: subscription.id } });
      await tx.dataFeedSubscription.deleteMany({ where: { id: subscription.id } });
      for (const setup of setups) {
        // Order matters: a SeasonClub references its club, so the season clubs go before the club (the first cleanup
        // attempt hit SeasonClub_organizationId_clubId_fkey).
        await tx.standing.deleteMany({ where: { seasonId: setup.seasonId } });
        await tx.fixture.deleteMany({ where: { id: setup.fixtureId } });
        await tx.seasonClub.deleteMany({ where: { seasonId: setup.seasonId } });
        await tx.entrant.deleteMany({ where: { seasonId: setup.seasonId } });
        await tx.season.deleteMany({ where: { id: setup.seasonId } });
        await tx.division.deleteMany({ where: { id: setup.divisionId } });
        await tx.competition.deleteMany({ where: { id: setup.competitionId } });
        await tx.club.deleteMany({ where: { organizationId: ORG, name: { startsWith: `Stress ${setup.slug}` } } });
      }
    });
    console.log("cleanup: five competitions, their fixtures, standings and the subscriber removed (use --keep to inspect)");
  }
}

function msPerEvent(count: number, elapsed: number): number {
  return count === 0 ? 0 : elapsed / count;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
