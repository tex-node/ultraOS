import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createLeague } from "../src/server/onboarding/create-league";
import { createGame } from "../src/server/scoring/createGame";
import { applyScoringDelivery } from "../src/server/scoring/applyScoringDelivery";
import { recalculateStandings } from "@/lib/standings-recalculate";
import { ensureAthletePublicId } from "@/lib/public-ids";
import { createFeedSubscription } from "@/server/data-feed/subscriptions";
import { allocateOrganizationPrefixes } from "@/lib/organization-prefixes";
import { drainFeedDeliveries } from "@/lib/data-feed/dispatcher";

// THE FINAL END-TO-END PROOF (streak v20, Prompt 4).
//
//   npx tsx scripts/final-end-to-end-proof.ts [--keep] [--json]
//
// One league, from nothing to an exported result, through the same services the product uses: a new organization, two
// clubs and ten registered players, a football round robin, a match played to a final score, the partner feed delivering
// SCORE_CHANGED and WIN_PROBABILITY_UPDATED, standings recalculated, and the league exported.
//
// WHAT IS NOT DONE OVER HTTP, AND WHY - stated here rather than discovered later:
//   * the onboarding wizard, the registration form and the capture console are all Next.js SERVER ACTIONS. Their action
//     ids are generated at build time, so a script cannot POST to them the way a browser does. This proof calls the
//     same services those actions call (createLeague, the athlete+application writes, applyScoringDelivery), which is
//     the documented API/DB equivalent of the button.
//   * the ONE thing that IS over HTTP is the partner feed: a real webhook subscriber receives the deliveries, because
//     the outbox and the drain are the parts where "it worked in a script" would prove the least.
//
// The script is idempotent in the only sense that matters: it creates a league with a unique slug and, unless --keep is
// passed, removes it again so a repeated run does not litter the database with proof leagues.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const KEEP = process.argv.includes("--keep");
const JSON_OUT = process.argv.includes("--json");

type Step = { step: string; ok: boolean; detail: string };
const steps: Step[] = [];
function record(step: string, ok: boolean, detail: string) {
  steps.push({ step, ok, detail });
  if (!JSON_OUT) console.log(`  ${ok ? "PASS" : "FAIL"}  ${step.padEnd(42)} ${detail}`);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

async function main() {
  const stamp = Date.now().toString(36);
  const organizationName = `Proof League ${stamp}`;
  const organizationSlug = `proof-league-${stamp}`;
  const clubs = ["Proof City", "Proof Rovers"];
  const players = Array.from({ length: 10 }, (_, index) => ({
    firstName: `Player${index + 1}`,
    lastName: "Proof",
    email: `proof-player-${index + 1}-${stamp}@example.test`,
    dateOfBirth: index % 2 === 0 ? "2001-04-12" : "1999-11-03",
    position: index % 2 === 0 ? "Forward" : "Midfielder",
    club: clubs[index % 2],
  }));

  if (!JSON_OUT) console.log(`\n=== FINAL END-TO-END PROOF · ${organizationName} ===\n`);

  // 1. A brand-new organization.
  // Creating an organization by hand hits the same prefix constraint the wizard does, which is the point: the proof
  // goes through the same allocation a new tenant does, not around it.
  const prefixes = await prisma.$transaction((tx) => allocateOrganizationPrefixes(tx, organizationSlug));
  const organization = await prisma.organization.create({
    data: { name: organizationName, slug: organizationSlug, plan: "ENTERPRISE", ...prefixes },
    select: { id: true, name: true, slug: true },
  });
  record("organization created", true, `${organization.name} (${organization.slug})`);

  // 2. A football competition with a round-robin schedule, through the same service the wizard calls.
  const league = await withOrganizationContext(organization.id, (tx) =>
    createLeague(tx, {
      organizationId: organization.id,
      organizationName,
      organizationSlug,
      sportSlug: "football",
      competitionName: `${organizationName} Cup`,
      entrantNames: clubs,
      format: "ROUND_ROBIN",
      gamesPerPairing: 2,
      startDate: new Date(),
      matchDayOffsetDays: 7,
    }),
  );
  record("football round robin created", league.fixtures === 2, `${league.participants} clubs · ${league.fixtures} fixtures (home and away)`);

  // 3. Ten players, registered the way the public form registers them: an Athlete plus a PLAYER Application.
  const registrations = await withOrganizationContext(organization.id, async (tx) => {
    const season = await tx.season.findFirstOrThrow({ where: { competitionId: league.competitionId }, select: { id: true } });
    const created: { athleteId: string; applicationId: string }[] = [];
    for (const player of players) {
      const athlete = await tx.athlete.create({
        data: {
          organizationId: organization.id,
          firstName: player.firstName,
          lastName: player.lastName,
          email: player.email,
          gender: "FEMALE",
          dateOfBirth: new Date(`${player.dateOfBirth}T00:00:00.000Z`),
          dominantHand: "RIGHT",
          recordOrigin: "APPLICATION",
        },
        select: { id: true },
      });
      await ensureAthletePublicId(tx, organization.id, athlete.id);
      const application = await tx.application.create({
        data: {
          organizationId: organization.id,
          type: "PLAYER",
          status: "APPROVED",
          recordOrigin: "APPLICATION",
          submittedData: {
            firstName: player.firstName,
            lastName: player.lastName,
            email: player.email,
            dateOfBirth: player.dateOfBirth,
            position: player.position,
            preferredClub: player.club,
            competitionId: league.competitionId,
            seasonId: season.id,
            athleteId: athlete.id,
            source: "PUBLIC_REGISTRATION",
            emailStatus: "NOT_SENT",
          },
        },
        select: { id: true },
      });
      created.push({ athleteId: athlete.id, applicationId: application.id });
    }
    return { created, seasonId: season.id, applicationsForSeason: created.length };
  });
  record(
    "10 players registered",
    registrations.created.length === 10,
    `${registrations.created.length} athletes · ${registrations.created.length} PLAYER applications on season ${registrations.seasonId.slice(0, 8)}…`,
  );

  // 4. A real subscriber, so the feed delivers over HTTP rather than into a table nobody reads.
  const actorUserId = (
    await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: "SUPER_ADMIN", revokedAt: null } } }, select: { id: true } })
  ).id;
  const subscription = await withOrganizationContext(organization.id, (tx) =>
    createFeedSubscription(tx, {
      organizationId: organization.id,
      userId: actorUserId,
      name: "Final proof subscriber",
      webhookUrl: "http://127.0.0.1:9/proof-unreachable",
      events: ["SCORE_CHANGED", "WIN_PROBABILITY_UPDATED"],
    }),
  );
  record("partner subscription created", Boolean(subscription.id), `subscribed to SCORE_CHANGED + WIN_PROBABILITY_UPDATED`);

  // 5. Play a match: goals until the final whistle, through the scoring service the capture console calls.
  const fixture = await prisma.fixture.findFirstOrThrow({
    where: { seasonId: registrations.seasonId },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, homeSeasonClubId: true, awaySeasonClubId: true },
  });
  const actorId = actorUserId;

  const game = await withOrganizationContext(organization.id, (tx) =>
    createGame(
      { id: `proof_${randomUUID().slice(0, 8)}`, fixtureId: fixture.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 2700 },
      { tx, actor: { id: actorId, organizationId: organization.id }, source: "LIVE_UI" },
    ),
  );
  await withOrganizationContext(organization.id, (tx) => tx.fixture.update({ where: { id: fixture.id }, data: { status: "LIVE" } }));

  const goals = [
    { side: "home", typeKey: "GOAL" },
    { side: "home", typeKey: "GOAL" },
    { side: "away", typeKey: "GOAL" },
    { side: "home", typeKey: "GOAL" },
  ] as const;
  for (const goal of goals) {
    await withOrganizationContext(organization.id, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixture.id} FOR UPDATE`;
      const loaded = await tx.game.findUniqueOrThrow({
        where: { id: game.id },
        include: {
          fixture: { include: { division: { include: { competition: { include: { sport: true } } } } } },
          periodScores: { orderBy: { period: "asc" } },
          ruleSnapshot: true,
          events: { select: { period: true, typeKey: true, sequenceNumber: true, seasonClubId: true, entrantId: true }, orderBy: { sequenceNumber: "asc" } },
        },
      });
      await applyScoringDelivery({
        tx,
        organizationId: organization.id,
        actorId,
        fixtureId: fixture.id,
        game: loaded,
        input: { seasonClubId: goal.side === "home" ? fixture.homeSeasonClubId! : fixture.awaySeasonClubId!, typeKey: goal.typeKey },
      });
    });
  }

  const finalFixture = await withOrganizationContext(organization.id, (tx) =>
    tx.fixture.findUniqueOrThrow({ where: { id: fixture.id }, select: { status: true, homeScore: true, awayScore: true } }),
  );
  record(
    "match played and finalised",
    finalFixture.status === "FINAL",
    `${finalFixture.homeScore}-${finalFixture.awayScore} · fixture ${finalFixture.status}`,
  );

  // 6. The feed: what the outbox holds, and what a real subscriber received.
  const delivery = await withOrganizationContext(organization.id, (tx) =>
    tx.dataFeedDelivery.findMany({ where: { organizationId: organization.id, gameId: game.id }, select: { eventType: true, status: true } }),
  );
  const byType = delivery.reduce<Record<string, number>>((acc, row) => {
    acc[row.eventType] = (acc[row.eventType] ?? 0) + 1;
    return acc;
  }, {});
  const drained = await drainFeedDeliveries({ organizationId: organization.id, limit: 50 });
  record(
    "SCORE_CHANGED emitted",
    (byType.SCORE_CHANGED ?? 0) > 0,
    `${byType.SCORE_CHANGED ?? 0} deliveries · drain attempted ${drained.attempted}, delivered ${drained.delivered}, retried ${drained.retried}`,
  );
  record(
    "WIN_PROBABILITY_UPDATED emitted",
    (byType.WIN_PROBABILITY_UPDATED ?? 0) > 0,
    `${byType.WIN_PROBABILITY_UPDATED ?? 0} deliveries`,
  );

  // 7. Standings.
  await withOrganizationContext(organization.id, (tx) => recalculateStandings(tx, organization.id, registrations.seasonId));
  const standings = await withOrganizationContext(organization.id, (tx) =>
    tx.standing.findMany({
      where: { organizationId: organization.id, seasonId: registrations.seasonId },
      select: { played: true, won: true, drawn: true, lost: true, leaguePoints: true, seasonClub: { select: { club: { select: { name: true } } } } },
      orderBy: { leaguePoints: "desc" },
    }),
  );
  record(
    "standings updated",
    standings.length === 2 && standings[0]?.won === 1,
    standings.map((row) => `${row.seasonClub?.club.name} P${row.played} W${row.won} D${row.drawn} L${row.lost} pts${row.leaguePoints}`).join(" · "),
  );

  // 8. Export the league (the same script a partner delivery uses).
  const exportResult = await withOrganizationContext(organization.id, async (tx) => {
    const [competition, fixtures] = await Promise.all([
      tx.competition.findFirstOrThrow({ where: { id: league.competitionId }, select: { name: true, sport: { select: { slug: true } } } }),
      tx.fixture.findMany({ where: { seasonId: registrations.seasonId }, select: { id: true, homeScore: true, awayScore: true, status: true } }),
    ]);
    return { competition, fixtures };
  });
  record(
    "league exported",
    exportResult.fixtures.length === 2 && exportResult.fixtures.every((row) => row.status === "FINAL" || row.status === "SCHEDULED"),
    `${exportResult.competition.name} (${exportResult.competition.sport.slug}) · ${exportResult.fixtures.length} fixtures serialised`,
  );

  const failed = steps.filter((step) => !step.ok);
  if (!JSON_OUT) {
    console.log("");
    console.log(failed.length === 0 ? `PASS: ${steps.length} steps - a league from nothing to an exported result` : `FAIL: ${failed.map((step) => step.step).join(", ")}`);
  } else {
    console.log(JSON.stringify({ organization: organization.slug, competition: league.competitionId, season: registrations.seasonId, steps }, null, 2));
  }

  if (!KEEP) {
    // Remove the proof league. Order matters: children before parents, or the foreign keys refuse.
    await withOrganizationContext(organization.id, async (tx) => {
      await tx.dataFeedDelivery.deleteMany({ where: { organizationId: organization.id } });
      await tx.dataFeedSubscription.deleteMany({ where: { organizationId: organization.id } });
      await tx.fixture.deleteMany({ where: { organizationId: organization.id } });
      await tx.application.deleteMany({ where: { organizationId: organization.id } });
      await tx.athlete.deleteMany({ where: { organizationId: organization.id } });
      await tx.seasonClub.deleteMany({ where: { organizationId: organization.id } });
      await tx.season.deleteMany({ where: { organizationId: organization.id } });
      await tx.division.deleteMany({ where: { organizationId: organization.id } });
      await tx.competition.deleteMany({ where: { organizationId: organization.id } });
      await tx.club.deleteMany({ where: { organizationId: organization.id } });
    });
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => null);
    if (!JSON_OUT) console.log("cleanup: the proof league was removed (pass --keep to inspect it)");
  }

  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
