import { NextResponse } from "next/server";
import { corsHeaders } from "./cors";
import { checkRateLimit, clientKeyFromRequest } from "./rate-limit";
import { apiError } from "./errors";
import { authenticateApiRequest, TIER_LIMITS, type AuthenticatedKey } from "./api-keys";

// Shared envelope for every /api/v1/* route (G.20, Part XX-XXI): CORS, rate limiting, and - since streak v9 -
// API-key authentication.
//
// THE DEFAULT IS AUTHENTICATED. `requireKey` is true unless a route explicitly opts out, so a new endpoint
// cannot accidentally ship public: forgetting the option fails closed. Two routes opt out on purpose and each
// says why at its call site: /api/v1/live (the public scoreboard widget, deliberately free) and the OpenAPI
// document.

export type ApiV1Context = {
  request: Request;
  /** Present when the route requires a key; null on a public route. */
  key: AuthenticatedKey | null;
};

export async function withPublicApiV1(
  request: Request,
  handler: (context: ApiV1Context) => Promise<NextResponse>,
  options: { requireKey?: boolean } = {},
): Promise<NextResponse> {
  const cors = corsHeaders(request);
  const requireKey = options.requireKey ?? true;

  // Unauthenticated requests still get the CORS headers so a browser sees the real error rather than a
  // cross-origin failure that reads like a network problem.
  if (requireKey) {
    const key = await authenticateApiRequest(request);
    if (!key) {
      const response = apiError("UNAUTHORIZED", "A valid API key is required. Send it as 'Authorization: Bearer <key>'.", cors);
      for (const [name, value] of Object.entries(cors)) response.headers.set(name, value as string);
      return response;
    }
    // Per-key quotas replace the anonymous per-IP limit: a partner's allowance should not depend on which
    // address their egress uses today.
    const limit = checkRateLimit(`key:${key.keyId}`, Date.now(), TIER_LIMITS[key.tier]);
    if (limit.limited) {
      return apiError("RATE_LIMITED", "Too many requests - see Retry-After.", {
        ...cors,
        "Retry-After": String(limit.retryAfterSeconds),
        "X-RateLimit-Limit": String(limit.limit),
        "X-RateLimit-Remaining": "0",
        "X-API-Tier": key.tier,
      });
    }
    const response = await handler({ request, key });
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value as string);
    response.headers.set("X-RateLimit-Limit", String(limit.limit));
    response.headers.set("X-RateLimit-Remaining", String(limit.remaining));
    response.headers.set("X-API-Tier", key.tier);
    return response;
  }

  const rateLimit = checkRateLimit(clientKeyFromRequest(request));
  if (rateLimit.limited) {
    return apiError("RATE_LIMITED", "Too many requests - see Retry-After.", {
      ...cors,
      "Retry-After": String(rateLimit.retryAfterSeconds),
      "X-RateLimit-Limit": String(rateLimit.limit),
      "X-RateLimit-Remaining": "0",
    });
  }
  const response = await handler({ request, key: null });
  for (const [name, value] of Object.entries(cors)) response.headers.set(name, value as string);
  response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
  response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
  return response;
}
