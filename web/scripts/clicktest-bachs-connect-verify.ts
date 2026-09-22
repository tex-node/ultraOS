import { createConnectedAccount, createAccountLink } from "../src/lib/bachs";

async function main() {
  const account = await createConnectedAccount({
    name: "Click-Test Kitchen (verify)",
    email: "kitchen-verify@neonultra.ng",
    metadata: { vendorId: "cmua2lc9y0000dlkkmx65om45", organizationId: "neon-ultra" },
  });
  console.log("ACCOUNT_OK id=" + account.account_id + " status=" + account.status);
  const link = await createAccountLink(account.account_id, {
    refreshUrl: "https://app.neonultra.ng/vendors/cmua2lc9y0000dlkkmx65om45",
    returnUrl: "https://app.neonultra.ng/vendors/cmua2lc9y0000dlkkmx65om45",
  });
  console.log("ONBOARDING_URL=" + link.url);
}

main().catch((e) => { console.error("VERIFY_FAIL:" + e.message); process.exit(1); });