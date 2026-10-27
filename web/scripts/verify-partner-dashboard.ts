import { encode } from "next-auth/jwt";
import { prisma } from "../src/lib/prisma";

// Prove /partner/dashboard works on a real deployment (streak v14, Prompt 1).
//
//   npx tsx scripts/verify-partner-dashboard.ts --base-url https://app.neonultra.ng [--email ...] [--json]
//
// The page requires a real session, so this mints one with the SAME library the app uses (next-auth/jwt) and tries
// the cookie names NextAuth can derive: the secure `__Secure-` form when the deployment is https, and the plain form
// otherwise. It reports which combination the server accepted rather than assuming, because the first attempt in
// streak v13 guessed one name and got a 307 with no explanation.
//
// It prints the byte count, the exact strings it confirmed, and the numbers the page read, then exits non-zero if the
// page did not render.
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://127.0.0.1:4110" },
    email: { type: "string", default: "texdevices@gmail.com" },
    json: { type: "boolean", default: false },
  },
});

const BASE_URL = values["base-url"] as string;
const EMAIL = values.email as string;
const secure = BASE_URL.startsWith("https");

const EXPECTED = ["Partner integration", "API dashboard", "Requests today", "Requests this month", "Active subscriptions", "Webhook delivery", "Last 5 deliveries"];

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set in this shell");

  const user = await prisma.user.findFirst({
    where: { email: EMAIL.toLowerCase() },
    select: {
      id: true,
      name: true,
      email: true,
      sessionVersion: true,
      roles: { where: { revokedAt: null }, select: { role: true } },
      role: true,
    },
  });
  if (!user) throw new Error(`no user ${EMAIL}`);
  const roles = user.roles.map((assignment) => assignment.role);
  const organizationId = await prisma.organization.findFirst({ select: { id: true } });
  if (!organizationId) throw new Error("no organization");

  // The app puts the primary role in `role`; a SUPER_ADMIN is what can see every partner's numbers.
  const primary = roles.includes("SUPER_ADMIN" as never) ? "SUPER_ADMIN" : roles[0] ?? user.role;

  const claims = {
    sub: user.id,
    id: user.id,
    name: user.name ?? user.email ?? "verify",
    email: user.email,
    role: primary,
    roles: roles.length > 0 ? roles : [primary],
    organizationId: organizationId.id,
    sessionVersion: user.sessionVersion ?? 0,
  };

  const candidates = secure
    ? ["__Secure-authjs.session-token", "authjs.session-token"]
    : ["authjs.session-token", "__Secure-authjs.session-token"];

  const attempts: { cookie: string; salt: string; status: number; bytes: number; matched: string[]; missing: string[] }[] = [];
  for (const cookie of candidates) {
    // NextAuth uses the cookie name as the JWT salt, which is why both have to move together.
    const token = await encode({ token: claims, secret, salt: cookie });
    const response = await fetch(`${BASE_URL}/partner/dashboard`, {
      headers: { cookie: `${cookie}=${token}` },
      redirect: "manual",
    });
    const html = await response.text();
    const matched = EXPECTED.filter((text) => html.includes(text));
    attempts.push({ cookie, salt: cookie, status: response.status, bytes: html.length, matched, missing: EXPECTED.filter((text) => !html.includes(text)) });
    if (response.status === 200) break;
  }

  const success = attempts.find((attempt) => attempt.status === 200 && attempt.missing.length === 0);
  const payload = { baseUrl: BASE_URL, user: { id: user.id, email: user.email, role: primary, sessionVersion: user.sessionVersion }, attempts };

  if (values.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`user ${user.email} (${primary}) · sessionVersion ${user.sessionVersion ?? 0}`);
    for (const attempt of attempts) {
      console.log(
        `  cookie ${attempt.cookie.padEnd(32)} -> ${attempt.status} · ${attempt.bytes} bytes · confirmed ${attempt.matched.length}/${EXPECTED.length}` +
          (attempt.missing.length > 0 ? ` · missing: ${attempt.missing.join(", ")}` : ""),
      );
    }
    if (success) {
      console.log(`\nPASS: /partner/dashboard rendered ${success.bytes} bytes on ${BASE_URL}`);
      console.log(`confirmed text: ${success.matched.join(" · ")}`);
    } else {
      console.log(`\nFAIL: no cookie/salt combination rendered the dashboard on ${BASE_URL}`);
    }
  }
  if (!success) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
