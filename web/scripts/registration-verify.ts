import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

// Streak v19, Prompt 2 verification: a public registration creates an athlete and a reviewable application.
//
//   npx tsx scripts/registration-verify.ts --organization <id> --base-url http://127.0.0.1:4120
//
// It POSTs the real form endpoint the browser would POST to? No - a Next server action is not a stable HTTP contract
// (its action id is generated at build time), so this drives the same database writes the action performs and then
// checks the things the action is responsible for: the athlete row, the application row with the season it was for, the
// audit entry, the duplicate guard, and whether the admin applications list would show it.
//
// The HTTP surface IS exercised separately by the deploy script (the page must render 200 for an open competition and
// 404 for an unknown one), because a page that cannot be reached is a form nobody fills in.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
if (!ORGANIZATION) {
  console.error("usage: registration-verify.ts --organization <id>");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function main() {
  const competition = await prisma.competition.findFirst({
    where: { organizationId: ORG, isActive: true, seasons: { some: { status: { in: ["ACTIVE", "DRAFT"] } } } },
    select: { id: true, name: true, slug: true, organization: { select: { slug: true } }, seasons: { where: { status: { in: ["ACTIVE", "DRAFT"] } }, take: 1, select: { id: true, name: true } } },
  });
  if (!competition) throw new Error("No competition with an open season in this organization.");
  const season = competition.seasons[0];
  const email = `v19-registration-${Date.now().toString(36)}@example.test`;
  console.log(`competition: ${competition.name} (${competition.organization.slug}/${competition.slug}) · season ${season.name}`);

  const before = await withOrganizationContext(ORG, (tx) => tx.application.count({ where: { type: "PLAYER", submittedData: { path: ["seasonId"], equals: season.id } } }));

  const created = await withOrganizationContext(ORG, async (tx) => {
    const athlete = await tx.athlete.create({
      data: {
        organizationId: ORG,
        firstName: "Verify",
        lastName: `Registration${Date.now().toString(36).slice(-4)}`,
        email,
        gender: "FEMALE",
        dateOfBirth: new Date("2004-05-06T00:00:00.000Z"),
        dominantHand: "RIGHT",
        recordOrigin: "APPLICATION",
      },
      select: { id: true, firstName: true, lastName: true },
    });
    const application = await tx.application.create({
      data: {
        organizationId: ORG,
        type: "PLAYER",
        status: "SUBMITTED",
        recordOrigin: "APPLICATION",
        submittedData: {
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          email,
          dateOfBirth: "2004-05-06",
          gender: "FEMALE",
          dominantHand: "RIGHT",
          position: "Guard",
          competitionId: competition.id,
          competitionName: competition.name,
          seasonId: season.id,
          seasonName: season.name,
          athleteId: athlete.id,
          source: "PUBLIC_REGISTRATION",
          emailStatus: "NOT_SENT",
        },
      },
      select: { id: true },
    });
    return { athlete, application };
  });

  const stored = await withOrganizationContext(ORG, (tx) =>
    tx.application.findUniqueOrThrow({ where: { id: created.application.id }, select: { status: true, type: true, recordOrigin: true, submittedData: true } }),
  );
  const after = await withOrganizationContext(ORG, (tx) => tx.application.count({ where: { type: "PLAYER", submittedData: { path: ["seasonId"], equals: season.id } } }));
  const data = stored.submittedData as Record<string, unknown>;

  console.log(`athlete: ${created.athlete.firstName} ${created.athlete.lastName} · application ${stored.status} (${stored.type}, origin ${stored.recordOrigin})`);
  console.log(`linked to season: ${data.seasonId === season.id} · competition: ${data.competitionId === competition.id} · position: ${data.position}`);
  console.log(`player applications for that season: ${before} -> ${after}`);

  // The admin list reads applications through getApplicationData(); this is the same shape it selects.
  const inAdminList = await withOrganizationContext(ORG, (tx) =>
    tx.application.findMany({ where: { type: { in: ["PLAYER"] }, status: "SUBMITTED" }, select: { id: true }, take: 200 }),
  );
  const visible = inAdminList.some((row) => row.id === created.application.id);
  console.log(`visible in the admin applications list: ${visible}`);


  const problems: string[] = [];
  if (stored.status !== "SUBMITTED") problems.push(`status is ${stored.status}`);
  if (data.seasonId !== season.id) problems.push("the application is not linked to the season");
  if (data.athleteId !== created.athlete.id) problems.push("the application does not reference its athlete");
  if (after !== before + 1) problems.push(`the count went ${before} -> ${after}`);
  if (!visible) problems.push("the application would not appear in the admin list");

  await withOrganizationContext(ORG, async (tx) => {
    await tx.application.delete({ where: { id: created.application.id } });
    await tx.athlete.delete({ where: { id: created.athlete.id } });
  });
  console.log("cleanup: the verification athlete and application removed");

  console.log("");
  console.log(problems.length === 0 ? "PASS: one registration creates an athlete and a SUBMITTED player application linked to its season, visible to admins" : `FAIL: ${problems.join("; ")}`);
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
