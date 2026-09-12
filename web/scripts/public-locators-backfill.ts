import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  PublicResourceLocatorType,
  PublicTokenLocatorType,
} from "../src/generated/prisma/enums";
import {
  hashPublicToken,
  upsertPublicResourceLocator,
  upsertPublicTokenLocator,
} from "../src/lib/public-locators";

const apply = process.argv.includes("--apply");

type SourceRow = {
  organizationId: string;
  id: string;
};

type TokenSourceRow = SourceRow & {
  token: string | null;
};

type ResourcePlan = {
  type: PublicResourceLocatorType;
  rows: SourceRow[];
};

type TokenPlan = {
  type: PublicTokenLocatorType;
  rows: TokenSourceRow[];
};

function duplicateCount(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates.size;
}

function planKeys(plan: ResourcePlan | TokenPlan, selector: "resource" | "token") {
  return selector === "resource"
    ? (plan.rows as SourceRow[]).map((row) => row.id)
    : (plan.rows as TokenSourceRow[])
        .filter((row) => row.token)
        .map((row) => hashPublicToken((plan as TokenPlan).type, row.token as string));
}

async function resourceLocatorState(plan: ResourcePlan) {
  const expected = new Map(
    plan.rows.map((row) => [row.id, `${row.organizationId}:${row.id}`]),
  );
  const existingRows = await prisma.publicResourceLocator.findMany({
    where: { resourceType: plan.type },
    select: {
      publicKey: true,
      organizationId: true,
      resourceId: true,
    },
  });
  let matchingLocatorRows = 0;
  let mismatchedLocatorRows = 0;
  for (const row of existingRows) {
    const expectedValue = expected.get(row.publicKey);
    if (!expectedValue) continue;
    if (expectedValue === `${row.organizationId}:${row.resourceId}`) {
      matchingLocatorRows += 1;
    } else {
      mismatchedLocatorRows += 1;
    }
  }
  const missingLocatorRows = plan.rows.length - matchingLocatorRows - mismatchedLocatorRows;
  return {
    existingLocatorRows: existingRows.length,
    matchingLocatorRows,
    missingLocatorRows,
    mismatchedLocatorRows,
    expectedInserts: missingLocatorRows,
    expectedUpdates: mismatchedLocatorRows,
  };
}

async function tokenLocatorState(plan: TokenPlan) {
  const eligibleRows = plan.rows.filter((row) => row.token);
  const expected = new Map(
    eligibleRows.map((row) => [
      hashPublicToken(plan.type, row.token as string),
      `${row.organizationId}:${row.id}`,
    ]),
  );
  const existingRows = await prisma.publicTokenLocator.findMany({
    where: { tokenType: plan.type },
    select: {
      tokenHash: true,
      organizationId: true,
      resourceId: true,
    },
  });
  let matchingLocatorRows = 0;
  let mismatchedLocatorRows = 0;
  for (const row of existingRows) {
    const expectedValue = expected.get(row.tokenHash);
    if (!expectedValue) continue;
    if (expectedValue === `${row.organizationId}:${row.resourceId}`) {
      matchingLocatorRows += 1;
    } else {
      mismatchedLocatorRows += 1;
    }
  }
  const missingLocatorRows = eligibleRows.length - matchingLocatorRows - mismatchedLocatorRows;
  return {
    existingLocatorRows: existingRows.length,
    matchingLocatorRows,
    missingLocatorRows,
    mismatchedLocatorRows,
    expectedInserts: missingLocatorRows,
    expectedUpdates: mismatchedLocatorRows,
  };
}

async function planSummary(plan: ResourcePlan | TokenPlan, selector: "resource" | "token") {
  const nullOrMalformedSelectors = selector === "resource"
    ? 0
    : (plan.rows as TokenSourceRow[]).filter((row) => !row.token).length;
  const keys = selector === "resource"
    ? planKeys(plan, selector)
    : planKeys(plan, selector);
  const locatorState = selector === "resource"
    ? await resourceLocatorState(plan as ResourcePlan)
    : await tokenLocatorState(plan as TokenPlan);
  return {
    type: plan.type,
    sourceRows: plan.rows.length,
    eligibleRows: plan.rows.length - nullOrMalformedSelectors,
    expectedLocatorRows: plan.rows.length - nullOrMalformedSelectors,
    duplicateSelectors: duplicateCount(keys),
    nullOrMalformedSelectors,
    ...locatorState,
  };
}

async function main() {
  const [
    athletes,
    clubs,
    events,
    fixtures,
    mediaAssets,
    tickets,
    orders,
  ] = await Promise.all([
    prisma.athlete.findMany({ select: { id: true, organizationId: true } }),
    prisma.club.findMany({ select: { id: true, organizationId: true } }),
    prisma.event.findMany({ select: { id: true, organizationId: true } }),
    prisma.fixture.findMany({ select: { id: true, organizationId: true } }),
    prisma.mediaAsset.findMany({ select: { id: true, organizationId: true } }),
    prisma.ticket.findMany({ select: { id: true, organizationId: true, code: true } }),
    prisma.order.findMany({ select: { id: true, organizationId: true, collectionCode: true } }),
  ]);

  const resourcePlans: ResourcePlan[] = [
    { type: PublicResourceLocatorType.ATHLETE, rows: athletes },
    { type: PublicResourceLocatorType.CLUB, rows: clubs },
    { type: PublicResourceLocatorType.EVENT, rows: events },
    { type: PublicResourceLocatorType.FIXTURE, rows: fixtures },
    { type: PublicResourceLocatorType.MEDIA_ASSET, rows: mediaAssets },
  ];
  const tokenPlans: TokenPlan[] = [
    {
      type: PublicTokenLocatorType.TICKET,
      rows: tickets.map((row) => ({ id: row.id, organizationId: row.organizationId, token: row.code })),
    },
    {
      type: PublicTokenLocatorType.ORDER,
      rows: orders.map((row) => ({ id: row.id, organizationId: row.organizationId, token: row.collectionCode })),
    },
  ];

  const summary = {
    dryRun: !apply,
    resources: await Promise.all(resourcePlans.map((plan) => planSummary(plan, "resource"))),
    tokens: await Promise.all(tokenPlans.map((plan) => planSummary(plan, "token"))),
  };

  const collisions = [
    ...summary.resources.map((item) => item.duplicateSelectors),
    ...summary.tokens.map((item) => item.duplicateSelectors),
  ].reduce((total, count) => total + count, 0);

  console.log(JSON.stringify({ ...summary, collisions }, null, 2));
  if (collisions > 0) {
    throw new Error("Refusing locator backfill because selector collisions were detected.");
  }

  if (!apply) return;

  await prisma.$transaction(async (tx) => {
    for (const plan of resourcePlans) {
      for (const row of plan.rows) {
        await upsertPublicResourceLocator(tx, {
          resourceType: plan.type,
          publicKey: row.id,
          organizationId: row.organizationId,
          resourceId: row.id,
        });
      }
    }
    for (const plan of tokenPlans) {
      for (const row of plan.rows) {
        if (!row.token) continue;
        await upsertPublicTokenLocator(tx, {
          tokenType: plan.type,
          rawToken: row.token,
          organizationId: row.organizationId,
          resourceId: row.id,
        });
      }
    }
  });

  console.log(JSON.stringify({ ok: true, applied: true }, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      dryRun: !apply,
      error: error instanceof Error ? error.message : "Public locator backfill failed.",
      code: typeof error === "object" && error && "code" in error ? error.code : undefined,
    }, null, 2));
    process.exit(1);
  });
