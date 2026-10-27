import { bachsConfig } from "@/lib/bachs";

// "Is this deployment production?" (streak v20, Prompt 2).
//
// The obvious check - `NODE_ENV !== "production"` - is WRONG here, and finding that out is the whole point of this file:
// `next start` sets NODE_ENV=production on staging as well, so the condition would never fire on the one host that
// actually holds a live key it should not. The order below mirrors how each deployment describes itself:
//
//   1. APP_ENV - set explicitly in shared/web.env ("production" or "staging"); the operator's own words.
//   2. A loopback AUTH_URL/NEXTAUTH_URL - staging is served on http://127.0.0.1:4120, production on its public origin,
//      so a loopback origin is a deployment that is not reachable by customers.
//   3. NODE_ENV, last: it only distinguishes a dev server from a built one.
export type DeploymentScope = "production" | "staging" | "development";

export function deploymentScope(): DeploymentScope {
  const explicit = (process.env.APP_ENV ?? process.env.DEPLOY_ENV ?? "").toLowerCase();
  if (explicit === "production" || explicit === "staging" || explicit === "development") return explicit;

  const origin = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(origin)) return "staging";

  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/** The Bachs key in use, by prefix only - never the key itself. */
export function bachsKeyKind(): "live" | "sandbox" | "none" {
  const key = bachsConfig()?.apiKey;
  if (!key) return "none";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_sandbox_") || key.startsWith("sk_test_")) return "sandbox";
  return "sandbox";
}

export type BillingSafetyWarning = { severity: "danger"; message: string } | null;

/**
 * The red banner /settings/billing shows.
 *
 * A live key outside production is a charge waiting to happen: staging shares its database with nobody, but it shares
 * the payment provider with everybody, and a clicking operator on staging charges a real card.
 */
export function billingSafetyWarning(): BillingSafetyWarning {
  const scope = deploymentScope();
  const kind = bachsKeyKind();
  if (kind !== "live") return null;
  if (scope === "production") return null;
  return {
    severity: "danger",
    message:
      `WARNING: this ${scope} deployment is using a LIVE Bachs key. A checkout here would charge a real customer. ` +
      "Replace BACHS_KEY (or BACH_IO) with a sandbox key, or set BACHS_MOCK=1 to use the mock provider.",
  };
}
