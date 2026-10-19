// Pure API-key helpers (streak v9, Prompt 2).
//
// Split from api-keys.ts (which is `server-only` because it touches Prisma) so the format guarantees can be
// unit-tested without a database: the raw key is never stored, the display prefix is not the secret, and only
// the two documented headers present a key.

import { createHash, randomBytes } from "node:crypto";

export const API_KEY_TIERS = ["BASIC", "PRO", "ENTERPRISE"] as const;
export type ApiKeyTierName = (typeof API_KEY_TIERS)[number];

/** Per-tier quotas for the authenticated API. Documented in /api-docs and ULTRA_LIVE_API_V1.md. */
export const TIER_LIMITS: Record<ApiKeyTierName, number> = { BASIC: 60, PRO: 600, ENTERPRISE: 6000 };

const KEY_PREFIX = "ulop_live";

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** `ulop_live_<8 hex>_<64 hex>` - the prefix is the display fragment, the rest is the secret. */
export function generateApiKey(): { rawKey: string; keyHash: string; prefix: string } {
  const display = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const rawKey = `${KEY_PREFIX}_${display}_${secret}`;
  return { rawKey, keyHash: hashApiKey(rawKey), prefix: `${KEY_PREFIX}_${display}` };
}

/** Bearer token from the Authorization header, or `x-api-key`. Both are accepted; Bearer is the documented one. */
export function keyFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim() || null;
  const header = request.headers.get("x-api-key");
  return header?.trim() || null;
}
