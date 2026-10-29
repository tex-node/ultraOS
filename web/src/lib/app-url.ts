// One place that decides which PUBLIC URL this deployment answers on (streak v32c).
//
// WHY. Every Bachs checkout was built from `process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://127.0.0.1:4120"`.
// Neither of the first two is set in production (the app uses AUTH_URL), so the fallback won: success_url and cancel_url
// were sent to Bachs as http://127.0.0.1:4120/..., and Bachs rejects loopback redirect URLs even in sandbox. The checkout
// failed at the card form with an error that says nothing about the real cause.
//
// THE RULE. A redirect URL that a payment processor will send a browser to must be a public origin. Loopback and private
// addresses are refused here with an actionable message, rather than being passed through to a provider that will only
// reject them later. The request's own origin is deliberately NOT used: behind Caddy it is 127.0.0.1:4110, which is exactly
// the wrong answer.
const LOOPBACK_OR_PRIVATE = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

export class PublicBaseUrlRequiredError extends Error {
  constructor(sources: string[]) {
    super(
      `A public app URL is required for payment redirects: set NEXT_PUBLIC_APP_URL (or AUTH_URL) to the domain customers ` +
        `visit, e.g. https://app.neonultra.ng. Looked at ${sources.join(", ") || "no variables"} and found only a loopback ` +
        `or unset value. Bachs rejects loopback return URLs even in sandbox.`,
    );
    this.name = "PublicBaseUrlRequiredError";
  }
}

function isPublic(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOOPBACK_OR_PRIVATE.has(host)) return false;
  // RFC1918 + link-local, so a container network address cannot masquerade as public.
  const privateV4 = /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;
  if (privateV4.test(host)) return false;
  return true;
}

export type PublicBaseUrlOptions = {
  /** Callers that are not handing the URL to a payment provider (mock checkout, registration links) may run on loopback. */
  allowLoopback?: boolean;
  env?: Record<string, string | undefined>;
};

/** The public origin this deployment answers on, without a trailing slash. Throws when none is usable. */
export function publicBaseUrl(options: PublicBaseUrlOptions = {}): string {
  const env = options.env ?? process.env;
  const candidates: { name: string; value: string | undefined }[] = [
    { name: "NEXT_PUBLIC_APP_URL", value: env.NEXT_PUBLIC_APP_URL },
    { name: "APP_BASE_URL", value: env.APP_BASE_URL },
    { name: "AUTH_URL", value: env.AUTH_URL },
    { name: "NEXTAUTH_URL", value: env.NEXTAUTH_URL },
  ];

  for (const candidate of candidates) {
    const raw = candidate.value?.trim();
    if (!raw) continue;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`${candidate.name} is not a valid URL: ${raw}`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`${candidate.name} must be http(s), got ${url.protocol}`);
    }
    if (!options.allowLoopback && !isPublic(url.hostname)) continue; // keep looking for a public one
    return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`.replace(/\/$/, "");
  }

  throw new PublicBaseUrlRequiredError(candidates.filter((candidate) => candidate.value).map((candidate) => candidate.name));
}
