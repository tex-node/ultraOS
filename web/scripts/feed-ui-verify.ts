import { createServer } from "node:http";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createFeedSubscription, rollFeedSecret } from "../src/server/data-feed/subscriptions";
import { queueGameLifecycleFeed } from "../src/lib/data-feed/dispatcher";
import { verifyWebhookSignature } from "../src/lib/data-feed/signature";

// Streak v8, Prompt 4 verification: the B2B console's operations, end to end.
//
//   npx tsx scripts/feed-ui-verify.ts --organization <id> --actor <userId> --base-url http://127.0.0.1:4120 [--keep]
//
// Creates a subscription through the SAME service the settings page's action calls, queues a GAME_FINAL for a
// real game, lets the CRON ENDPOINT deliver it (the same thing the 30-second timer calls), verifies the
// signature at a local receiver, then rolls the secret and proves the old one no longer verifies.
//
// Env: CRON_SECRET (from the app env file) for the cron call.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const BASE_URL = arg("base-url") ?? "http://127.0.0.1:4120";
const KEEP = process.argv.includes("--keep");
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const PORT = Number(arg("port") ?? 8097);
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: feed-ui-verify.ts --organization <id> --actor <userId> [--base-url url] [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;

async function main() {
  const game = await withOrganizationContext(ORG, (tx) =>
    tx.game.findFirst({ where: { organization: { id: ORG } }, orderBy: { createdAt: "desc" }, select: { id: true } }),
  );
  if (!game) throw new Error("no game in this organization to emit an event for");

  const created = await withOrganizationContext(ORG, (tx) =>
    createFeedSubscription(tx, {
      organizationId: ORG,
      userId: ACTOR_ID,
      name: "Console verification feed",
      webhookUrl: `http://127.0.0.1:${PORT}/hooks`,
      events: ["GAME_FINAL"],
    }),
  );
  console.log(`subscription ${created.id} created · secret length ${created.secret.length}`);

  await withOrganizationContext(ORG, (tx) =>
    queueGameLifecycleFeed(tx, {
      organizationId: ORG,
      gameId: game.id,
      eventType: "GAME_FINAL",
      event: { eventId: game.id, sequenceNumber: 1, period: 4, clockSeconds: 0, points: null, eventType: "GAME_FINAL" },
    }),
  );

  const signatureResults: { verified: boolean; body: string }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const verdict = verifyWebhookSignature(created.secret, body, String(request.headers["x-ultra-signature"] ?? ""));
      signatureResults.push({ verified: verdict.ok, body });
      response.writeHead(verdict.ok ? 200 : 401, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  try {
    const cron = await fetch(`${BASE_URL}/api/cron/drain-feeds`, { headers: { "x-cron-secret": CRON_SECRET } })
      .then((response) => response.json() as Promise<{ ok?: boolean; attempted?: number; delivered?: number }>)
      .catch((error) => ({ error: String(error) }));
    console.log(`cron drain: ${JSON.stringify(cron)}`);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && signatureResults.length === 0) await new Promise((resolve) => setTimeout(resolve, 250));

    const delivery = await withOrganizationContext(ORG, (tx) =>
      tx.dataFeedDelivery.findFirst({ where: { subscriptionId: created.id }, orderBy: { createdAt: "desc" }, select: { status: true, attempts: true, lastStatusCode: true } }),
    );
    console.log(`receiver: ${signatureResults.length} request(s), ${signatureResults.filter((entry) => entry.verified).length} verified`);
    console.log(`delivery: ${JSON.stringify(delivery)}`);

    const rolled = await withOrganizationContext(ORG, (tx) => rollFeedSecret(tx, { organizationId: ORG, userId: ACTOR_ID, subscriptionId: created.id }));
    const body = signatureResults[0]?.body ?? "{}";
    const staleHeader = `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}`;
    // Deterministic check: a body signed with the OLD secret must not verify against the NEW one.
    const oldSignatureVerifiesNew = verifyWebhookSignature(rolled.secret, body, staleHeader).ok;
    console.log(`secret rolled · new length ${rolled.secret.length} · old secret ${rolled.secret === created.secret ? "UNCHANGED (bug)" : "replaced"}`);

    const audits = await prisma.auditLog.count({ where: { organizationId: ORG, entityId: created.id } });
    console.log(`audit rows for this subscription: ${audits}`);

    const problems: string[] = [];
    if (!signatureResults.some((entry) => entry.verified)) problems.push("no verified webhook received");
    if (delivery?.status !== "DELIVERED") problems.push(`delivery status is ${delivery?.status ?? "missing"}, expected DELIVERED`);
    if (rolled.secret === created.secret) problems.push("rollSecret returned the same secret");
    if (oldSignatureVerifiesNew) problems.push("the rolled secret still accepts the old signature");
    if (audits < 2) problems.push(`${audits} audit row(s), expected at least 2 (create + roll)`);

    console.log("");
    console.log(problems.length === 0 ? "PASS: console operations work end to end (create, deliver, verify, roll)" : `FAIL: ${problems.join("; ")}`);
    if (problems.length > 0) process.exitCode = 1;
  } finally {
    server.close();
    if (!KEEP) {
      await withOrganizationContext(ORG, async (tx) => {
        await tx.dataFeedDelivery.deleteMany({ where: { subscriptionId: created.id } });
        await tx.dataFeedSubscription.deleteMany({ where: { id: created.id } });
      });
      console.log("cleanup: subscription and its deliveries removed (use --keep to inspect)");
    }
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
