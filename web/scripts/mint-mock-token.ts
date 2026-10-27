import { createMockCheckout } from "../src/lib/bachs-mock";

// Prints a mock checkout token for one organization (streak v19 verification helper).
//   npx tsx scripts/mint-mock-token.ts <organizationId> [PRO|ENTERPRISE]
const organizationId = process.argv[2];
const plan = (process.argv[3] === "ENTERPRISE" ? "ENTERPRISE" : "PRO") as "PRO" | "ENTERPRISE";
if (!organizationId) {
  console.error("usage: mint-mock-token.ts <organizationId> [PRO|ENTERPRISE]");
  process.exit(1);
}
process.stdout.write(createMockCheckout({ organizationId, plan }));
