import { encode } from "next-auth/jwt";
import { prisma } from "../src/lib/prisma";

// Streak v20, Prompt 2 verification: the live-key banner RENDERS for a signed-in operator.
//
//   npx tsx scripts/verify-billing-banner.ts --base-url http://127.0.0.1:4120
//
// The logic is unit-tested by scripts/billing-safety-verify.ts; this proves the wiring - that /settings/billing, behind
// its `operations:manage` gate, actually puts the banner in the HTML. A warning nobody sees is the same as no warning,
// which is how the live key sat on staging for two streaks.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const BASE_URL = (arg("base-url") ?? "http://127.0.0.1:4120").replace(/\/$/, "");
const EMAIL = arg("email") ?? "texdevices@gmail.com";

const EXPECTED = ["LIVE Bachs key", "A checkout here would charge a real customer"];

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set: cannot mint a session.");
  const secure = BASE_URL.startsWith("https://");

  const user = await prisma.user.findFirstOrThrow({
    where: { email: EMAIL },
    select: { id: true, name: true, email: true, role: true, sessionVersion: true, roles: { where: { revokedAt: null }, select: { role: true } } },
  });
  const roles = user.roles.map((assignment) => assignment.role);
  const primary = roles.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : roles[0] ?? user.role;
  const organization = await prisma.organization.findFirstOrThrow({ select: { id: true } });

  const claims = {
    sub: user.id,
    id: user.id,
    name: user.name ?? user.email ?? "verify",
    email: user.email,
    role: primary,
    roles: roles.length > 0 ? roles : [primary],
    organizationId: organization.id,
    sessionVersion: user.sessionVersion ?? 0,
  };

  const candidates = secure ? ["__Secure-authjs.session-token", "authjs.session-token"] : ["authjs.session-token", "__Secure-authjs.session-token"];
  for (const cookie of candidates) {
    const token = await encode({ token: claims, secret, salt: cookie });
    const response = await fetch(`${BASE_URL}/settings/billing`, { headers: { cookie: `${cookie}=${token}` }, redirect: "manual" });
    const html = await response.text();
    const matched = EXPECTED.filter((text) => html.includes(text));
    console.log(`  ${cookie} -> ${response.status} (${html.length} bytes) · banner ${matched.length}/${EXPECTED.length}`);
    if (response.status !== 200) continue;
    if (matched.length === EXPECTED.length) {
      const shown = html.includes("test mode") ? " · TEST MODE also shown" : "";
      console.log(`PASS: /settings/billing renders the live-key warning${shown}`);
      return;
    }
    console.log(`  rendered text sample: ${html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 260)}`);
    throw new Error("the page rendered but the warning was not in it");
  }
  throw new Error(`/settings/billing did not render with a minted session (tried ${candidates.join(", ")})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
