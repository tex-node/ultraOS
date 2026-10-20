import { createServer } from "node:http";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createFeedSubscription } from "../src/server/data-feed/subscriptions";
import { drainFeedDeliveries } from "../src/lib/data-feed/dispatcher";
import { verifyWebhookSignature } from "../src/lib/data-feed/signature";
import { recordScoreInternal } from "../src/app/games/actions-internal";
import { createGame } from "../src/server/scoring/createGame";
import { randomUUID } from "node:crypto";
import { createApiKey } from "../src/lib/api-v1/api-keys";

// Streak v12, Prompt 2 verification: a basketball game scored for real, with a WIN_PROBABILITY_UPDATED delivery
// arriving at an HMAC listener after each scoring change.
//
//   npx tsx scripts/win-probability-verify.ts --organization <id> --actor <userId> [--base-url url] [--keep]
//
// The point is not that a number arrives - it is that the number MOVES in the right direction for the right reason:
// the side that scores goes up, the side that concedes goes down, and the two always sum to one.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const BASE_URL = arg("base-url") ?? "http://127.0.0.1:4120";
const PORT = Number(arg("port") ?? 8097);
const KEEP = process.argv.includes("--keep");
const CRON_SECRET = process.env.CRON_SECRET ?? "";
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: win-probability-verify.ts --organization <id> --actor <userId> [--base-url url]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;
const TAG = `WIN PROB ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

async function main() {
  const setup = await withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "basketball" }, select: { id: true } });
    const competition = await tx.competition.create({ data: { organizationId: ORG, sportId: sport.id, name: TAG, slug: `winprob-${Date.now()}` }, select: { id: true } });
    const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "League", slug: "league" }, select: { id: true } });
    const season = await tx.season.create({ data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} season`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, select: { id: true } });
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const sides = [];
    for (const [index, name] of ["WinProb A", "WinProb B"].entries()) {
      const club = await tx.club.create({ data: { organizationId: ORG, sportId: sport.id, name: `${name} ${randomUUID().slice(0, 4)}`, shortName: `W${index + 1}${randomUUID().slice(0, 3)}`.toUpperCase() }, select: { id: true } });
      const seasonClub = await tx.seasonClub.create({ data: { organizationId: ORG, seasonId: season.id, clubId: club.id, divisionId: division.id }, select: { id: true } });
      sides.push(seasonClub.id);
    }
    const fixture = await tx.fixture.create({
      // A public-API read only sees a PRODUCTION presentation fixture (the scope gate), so the verification fixture
      // has to be one - otherwise the live-feed 404s for a reason that has nothing to do with win probability.
      data: { organizationId: ORG, seasonId: season.id, divisionId: division.id, venueId: venue.id, homeSeasonClubId: sides[0], awaySeasonClubId: sides[1], scheduledAt: new Date(), status: "SCHEDULED", recordOrigin: "PRODUCTION" },
      select: { id: true },
    });
    return { competitionId: competition.id, divisionId: division.id, seasonId: season.id, fixtureId: fixture.id, home: sides[0], away: sides[1] };
  });

  const subscription = await withOrganizationContext(ORG, (tx) =>
    createFeedSubscription(tx, {
      organizationId: ORG,
      userId: ACTOR_ID,
      name: "Win probability verification",
      webhookUrl: `http://127.0.0.1:${PORT}/hooks`,
      events: ["WIN_PROBABILITY_UPDATED"],
    }),
  );

  const received: { verified: boolean; event: Record<string, unknown> }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const verdict = verifyWebhookSignature(subscription.secret, body, String(request.headers["x-ultra-signature"] ?? ""));
      received.push({ verified: verdict.ok, event: (JSON.parse(body) as { event: Record<string, unknown> }).event });
      response.writeHead(verdict.ok ? 200 : 401).end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  const game = await withOrganizationContext(ORG, (tx) =>
    createGame({ id: `wp_${randomUUID().slice(0, 8)}`, fixtureId: setup.fixtureId, status: "LIVE", currentPeriod: 4, clockSecondsRemaining: 120 }, { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" }),
  );
  await withOrganizationContext(ORG, (tx) => tx.fixture.update({ where: { id: setup.fixtureId }, data: { status: "LIVE" } }));

  try {
    // Basketball does not go through a scoring module: it has its own scorer, which is what the console calls.
    // (The first version of this script used applyScoringDelivery and threw NO_SCORING_MODULE - which is exactly how
    // the emission point was found to be wrong.)
    const steps: { side: "home" | "away"; points: number }[] = [
      { side: "home", points: 2 },
      { side: "home", points: 2 },
      { side: "away", points: 3 },
    ];
    for (const step of steps) {
      const form = new FormData();
      form.set("seasonClubId", step.side === "home" ? setup.home : setup.away);
      form.set("playerId", "");
      form.set("points", String(step.points));
      form.set("description", `Win probability step (${step.points} for ${step.side})`);
      await recordScoreInternal(game.id, setup.fixtureId, form, { id: ACTOR_ID, organizationId: ORG });
      await fetch(`${BASE_URL}/api/cron/drain-feeds`, { headers: { "x-cron-secret": CRON_SECRET } }).catch(() => null);
      if (received.length < steps.indexOf(step) + 1) await drainFeedDeliveries({ organizationId: ORG, limit: 10 });
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && received.length < steps.indexOf(step) + 1) await new Promise((resolve) => setTimeout(resolve, 150));
    }

    // api/v1 is keyed (streak v9): the live-feed check needs a real key, or it would be testing the 401 path.
    const key = await withOrganizationContext(ORG, (tx) => createApiKey(tx, { organizationId: ORG, userId: ACTOR_ID, name: "Win probability verification", tier: "BASIC" }));
    const feedResponse = await fetch(`${BASE_URL}/api/v1/games/${setup.fixtureId}/live-feed`, { headers: { authorization: `Bearer ${key.rawKey}` } });
    const liveFeed = await feedResponse.json().catch((error) => ({ error: String(error) }));
    console.log(`live-feed status: ${feedResponse.status}`);

    console.log(`received ${received.length} WIN_PROBABILITY_UPDATED delivery(ies)`);
    for (const delivery of received) {
      const event = delivery.event as { winProbHome?: number; winProbAway?: number; method?: string; homeScore?: number; awayScore?: number; confidence?: number };
      console.log(`  ${delivery.verified ? "VERIFIED" : "REJECTED"} · ${event.homeScore}-${event.awayScore} · home ${((event.winProbHome ?? 0) * 100).toFixed(1)}% · away ${((event.winProbAway ?? 0) * 100).toFixed(1)}% · ${event.method} (conf ${event.confidence})`);
    }
    console.log(`live-feed: wp=${JSON.stringify((liveFeed as { wp?: unknown }).wp)} wpm=${(liveFeed as { wpm?: string }).wpm ?? "n/a"}`);

    const problems: string[] = [];
    if (received.length !== 3) problems.push(`${received.length} deliveries, expected 3`);
    if (received.some((delivery) => !delivery.verified)) problems.push("a delivery failed HMAC verification");
    let previousHome = 0.5;
    for (const [index, delivery] of received.entries()) {
      const event = delivery.event as { winProbHome?: number; winProbAway?: number };
      const home = event.winProbHome ?? 0;
      const away = event.winProbAway ?? 0;
      if (Math.abs(home + away - 1) > 0.0002) problems.push(`step ${index + 1}: ${home} + ${away} != 1`);
      if (index < 2 && home <= previousHome) problems.push(`step ${index + 1}: the scoring side did not gain probability (${previousHome} -> ${home})`);
      if (index === 2 && home >= previousHome) problems.push(`step 3: the conceding side did not lose probability (${previousHome} -> ${home})`);
      if (home < 0.02 || home > 0.98) problems.push(`step ${index + 1}: probability ${home} outside the live clamp`);
      previousHome = home;
    }
    const feed = liveFeed as { wp?: [number, number]; wpm?: string };
    if (!Array.isArray(feed.wp) || feed.wp.length !== 2) problems.push("live-feed has no wp pair");
    else if (Math.abs(feed.wp[0] + feed.wp[1] - 1) > 0.0002) problems.push(`live-feed wp does not sum to 1 (${feed.wp[0]} + ${feed.wp[1]})`);
    if (!feed.wpm) problems.push("live-feed does not name the model");

    console.log("");
    console.log(problems.length === 0 ? "PASS: the probability moves with the score, sums to one, is HMAC-signed and is on the live feed" : `FAIL: ${problems.join("; ")}`);
    if (problems.length > 0) process.exitCode = 1;
  } finally {
    server.close();
    await withOrganizationContext(ORG, async (tx) => {
      await tx.dataFeedDelivery.deleteMany({ where: { subscriptionId: subscription.id } });
      await tx.dataFeedSubscription.deleteMany({ where: { id: subscription.id } });
      await tx.apiKey.deleteMany({ where: { organizationId: ORG, name: "Win probability verification" } });
      if (!KEEP) {
        await tx.fixture.deleteMany({ where: { id: setup.fixtureId } });
        await tx.season.deleteMany({ where: { id: setup.seasonId } });
        await tx.division.deleteMany({ where: { id: setup.divisionId } });
        await tx.competition.deleteMany({ where: { id: setup.competitionId } });
        await tx.club.deleteMany({ where: { organizationId: ORG, name: { startsWith: "WinProb" } } });
      }
    });
    console.log(KEEP ? "kept: fixture and subscription data left in place" : "cleanup: subscription, deliveries and the verification competition removed");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
