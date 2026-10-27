import { prisma } from "../src/lib/prisma";
import { createMockCheckout, mockBachsEnabled, mockCheckoutEventBody, mockSigningSecret, signBachsBody, verifyMockCheckoutToken } from "../src/lib/bachs-mock";

// Streak v19, Prompt 1 verification: the mock checkout, end to end, through the REAL webhook.
//
//   npx tsx scripts/bachs-mock-verify.ts --organization <orgId> --base-url http://127.0.0.1:4120
//
// It mints a mock checkout token exactly as the billing action does, signs a checkout.completed body exactly as the
// provider does, POSTs it to /api/webhooks/bachs, and then checks the database: plan, customer id and the audit row.
// The token's own tamper checks are exercised too - a mock that accepts a forged token would be a hole in the one
// place that can change a plan without money.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const BASE_URL = (arg("base-url") ?? "http://127.0.0.1:4120").replace(/\/$/, "");
if (!ORGANIZATION) {
  console.error("usage: bachs-mock-verify.ts --organization <id> [--base-url url]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function main() {
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { name: true, plan: true, bachsCustomerId: true } });
  console.log(`organization: ${before.name} · plan ${before.plan} · customer ${before.bachsCustomerId ?? "none"}`);
  console.log(`mock enabled: ${mockBachsEnabled()} · signing secret present: ${Boolean(mockSigningSecret())}`);
  if (!mockBachsEnabled()) throw new Error("A real BACHS_KEY is configured, so the mock provider is disabled - this script must not be used there.");
  const secret = mockSigningSecret();
  if (!secret) throw new Error("No Bachs webhook secret: nothing can be signed, and the webhook would refuse the event.");

  const problems: string[] = [];

  // Token tamper checks first, because the token is the only thing standing between a visitor and a plan change.
  const token = createMockCheckout({ organizationId: ORG, plan: "PRO" });
  const valid = verifyMockCheckoutToken(token);
  console.log(`token verifies: ${valid.ok}`);
  if (!valid.ok) problems.push("a freshly minted token did not verify");
  const [body, mac] = token.split(".");
  const forged = `${body}.${mac.slice(0, -2)}xx`;
  const forgedOk = verifyMockCheckoutToken(forged).ok;
  const swapped = `${Buffer.from(JSON.stringify({ organizationId: ORG, plan: "ENTERPRISE", createdAt: Date.now() })).toString("base64url")}.${mac}`;
  const swappedOk = verifyMockCheckoutToken(swapped).ok;
  console.log(`forged signature accepted: ${forgedOk} · swapped payload accepted: ${swappedOk}`);
  if (forgedOk) problems.push("a token with a broken signature verified");
  if (swappedOk) problems.push("a token with a swapped payload verified");

  // The real delivery.
  const checkout = valid.ok ? valid.checkout : { organizationId: ORG, plan: "PRO" as const, createdAt: Date.now() };
  const eventId = `evt_mock_verify_${Date.now().toString(36)}`;
  const eventBody = mockCheckoutEventBody(checkout, eventId);
  const { header } = signBachsBody(eventBody, secret);
  const response = await fetch(`${BASE_URL}/api/webhooks/bachs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bachs-signature-v2": header },
    body: eventBody,
  });
  const text = await response.text();
  console.log(`POST /api/webhooks/bachs -> ${response.status} ${text.slice(0, 160)}`);
  if (response.status !== 200) problems.push(`the signed event was rejected with ${response.status}`);

  const after = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { plan: true, bachsCustomerId: true } });
  const audit = await prisma.auditLog.findFirst({
    where: { organizationId: ORG, action: "ORG_UPGRADED_BY_BACHS", details: { path: ["bachsEventId"], equals: eventId } },
    select: { userId: true, details: true },
  });
  console.log(`after: plan ${after.plan} · customer ${after.bachsCustomerId}`);
  console.log(`audit row for ${eventId}: ${audit ? `by ${audit.userId}` : "MISSING"}`);

  if (after.plan !== "PRO") problems.push(`the plan is ${after.plan}, expected PRO`);
  if (!after.bachsCustomerId?.startsWith("cust_mock_")) problems.push("the mock customer id was not stored");
  if (!audit) problems.push("no audit row carried the event id");
  if (audit && audit.userId !== "system00000000000000000") problems.push("the audit row is not attributed to SYSTEM");

  await prisma.organization.update({ where: { id: ORG }, data: { plan: before.plan, bachsCustomerId: before.bachsCustomerId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: ORG, details: { path: ["bachsEventId"], equals: eventId } } });
  console.log(`restored: plan ${before.plan} · customer ${before.bachsCustomerId ?? "none"}`);

  console.log("");
  console.log(problems.length === 0 ? "PASS: mock checkout mints a verifiable token, refuses forged ones, and its signed event upgrades the plan with a SYSTEM audit row" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
