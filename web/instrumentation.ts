// Next.js instrumentation hook (streak v22, Prompt 3).
//
// register() runs once per server process, before it starts handling requests, which is the only place a configuration
// error that risks real money can be stopped. The check is deliberately narrow - a LIVE payment key on a non-production
// deployment - and everything else about billing stays a runtime concern.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertBillingSafety } = await import("@/lib/billing-safety");
  // Throws LiveKeyInNonProductionError when APP_ENV is staging (or the deployment looks non-production) and the key is
  // sk_live_. The process then fails to start, which the systemd unit and the deploy script both notice.
  assertBillingSafety();
}
