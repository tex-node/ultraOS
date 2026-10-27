import { billingSafetyWarning, bachsKeyKind, deploymentScope } from "../src/lib/deployment-safety";
import { bachsBillingConfigured, productIdForPlan } from "../src/lib/bachs-billing";

// Staging's Bachs state after the sandbox key was installed (streak v24, Prompt 1).
async function main() {
  console.log(`  scope            : ${deploymentScope()}`);
  console.log(`  key kind         : ${bachsKeyKind()}`);
  console.log(`  live-key banner  : ${billingSafetyWarning() ? "PRESENT" : "absent"}`);
  console.log(`  billing configured: ${bachsBillingConfigured()}`);
  console.log(`  product PRO      : ${productIdForPlan("PRO") ? "set" : "MISSING"}`);
  console.log(`  product ENTERPRISE: ${productIdForPlan("ENTERPRISE") ? "set" : "MISSING"}`);
}
main();
