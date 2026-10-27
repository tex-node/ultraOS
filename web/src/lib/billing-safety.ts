import { bachsConfig } from "@/lib/bachs";
import { deploymentScope } from "@/lib/deployment-safety";

// Refuse to start with a live payment key outside production (streak v22, Prompt 3).
//
// The v21 banner told an operator about this, but a banner only helps someone who opens that page. A staging deployment
// holding `sk_live_...` can take real money from a test, so the failure has to happen at startup, loudly, before the
// server accepts a request.
export class LiveKeyInNonProductionError extends Error {
  constructor(scope: string) {
    super(
      `REFUSING TO START: APP_ENV=${scope} is using a LIVE Bachs key (sk_live_...). A checkout on this deployment would ` +
        "charge a real customer. Set BACHS_SANDBOX_KEY (or BACHS_KEY) to a sandbox key, or set BACHS_MOCK=1 to use the " +
        "mock provider.",
    );
    this.name = "LiveKeyInNonProductionError";
  }
}

export type BillingSafetyVerdict = { ok: true } | { ok: false; reason: string };

/** Pure decision, so a test can exercise it without starting a server. */
export function assessBillingSafety(env: Record<string, string | undefined> = process.env): BillingSafetyVerdict {
  const scope = deploymentScope();
  const key = env.BACHS_KEY ?? env.BACH_IO ?? "";
  if (scope === "production") return { ok: true };
  if (key.startsWith("sk_live_")) return { ok: false, reason: new LiveKeyInNonProductionError(scope).message };
  return { ok: true };
}

/** Throws when the deployment must not start. Called from instrumentation. */
export function assertBillingSafety(env: Record<string, string | undefined> = process.env): void {
  const verdict = assessBillingSafety(env);
  if (!verdict.ok) throw new LiveKeyInNonProductionError(deploymentScope());
}

/** True when a checkout would use the mock provider rather than a real key. */
export function usingMockProvider(env: Record<string, string | undefined> = process.env): boolean {
  if (env.BACHS_MOCK === "1") return true;
  return !bachsConfig()?.apiKey;
}
