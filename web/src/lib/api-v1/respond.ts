import { NextResponse } from "next/server";
import { corsHeaders } from "./cors";
import { checkRateLimit, clientKeyFromRequest } from "./rate-limit";
import { apiError } from "./errors";

// Shared envelope for every /api/v1/* route (G.20, Part XX-XXI): CORS headers applied
// intentionally (never `*`), rate limiting checked before the handler runs, and every response -
// success or error - carries the same X-RateLimit-* headers so a consumer can self-throttle.
export async function withPublicApiV1(request: Request, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  const cors = corsHeaders(request);
  const rateLimit = checkRateLimit(clientKeyFromRequest(request));
  if (rateLimit.limited) {
    return apiError("RATE_LIMITED", "Too many requests - see Retry-After.", {
      ...cors, "Retry-After": String(rateLimit.retryAfterSeconds),
      "X-RateLimit-Limit": String(rateLimit.limit), "X-RateLimit-Remaining": "0",
    });
  }
  const response = await handler();
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value as string);
  response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
  response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
  return response;
}
