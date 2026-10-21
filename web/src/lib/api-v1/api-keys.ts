import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";
import { writeAuditLog } from "@/lib/audit";

// Developer API keys (streak v9, Prompt 2).
//
// The raw key exists exactly once: it is generated here, returned to the caller that creates it, and only its
// sha256 is stored. Nothing in this module can read a key back - `listApiKeys` does not even select the hash.
//
// Lookup happens BEFORE the tenant is known, so it cannot go through withOrganizationContext. It uses the
// SECURITY DEFINER function `resolve_api_key` from the migration, which returns (id, organization, tier) and no
// secret material.

// Format helpers live in api-key-format.ts (no server-only) so they can be unit-tested; re-exported here so
// callers have one import.
import { API_KEY_TIERS as TIERS, TIER_LIMITS as LIMITS, generateApiKey, hashApiKey, keyFromRequest, type ApiKeyTierName as TierName } from "./api-key-format";
export { TIERS as API_KEY_TIERS, LIMITS as TIER_LIMITS, generateApiKey, hashApiKey, keyFromRequest };
export type ApiKeyTierName = TierName;

export type CreatedApiKey = { id: string; name: string; prefix: string; tier: ApiKeyTierName; rawKey: string };

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  tier: ApiKeyTierName;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

export type AuthenticatedKey = { keyId: string; organizationId: string; tier: ApiKeyTierName };

/**
 * Resolve a presented key. Returns null for unknown/inactive/revoked keys - the caller must not distinguish
 * between those cases in its response.
 */
export async function resolveApiKey(rawKey: string): Promise<AuthenticatedKey | null> {
  if (!rawKey || rawKey.length > 200) return null;
  const rows = await prisma.$queryRaw<{ id: string; organization_id: string; tier: ApiKeyTierName }[]>`
    SELECT id, organization_id, tier FROM resolve_api_key(${hashApiKey(rawKey)})
  `;
  const row = rows[0];
  if (!row) return null;
  return { keyId: row.id, organizationId: row.organization_id, tier: row.tier };
}

/** Authenticate a request and record `lastUsedAt` (best effort: a failed touch must not fail the request). */
export async function authenticateApiRequest(request: Request): Promise<AuthenticatedKey | null> {
  const raw = keyFromRequest(request);
  if (!raw) return null;
  const key = await resolveApiKey(raw);
  if (!key) return null;
  // Touch the key and count the request (streak v13, Prompt 4). Both are best effort: a metering failure must
  // never fail the partner's request, and a dashboard that misses one count is better than an API that 500s.
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  void withOrganizationContext(key.organizationId, async (tx) => {
    await tx.apiKey.updateMany({ where: { id: key.keyId, organizationId: key.organizationId }, data: { lastUsedAt: new Date() } });
    await tx.apiKeyUsageDaily.upsert({
      where: { apiKeyId_day: { apiKeyId: key.keyId, day } },
      create: { organizationId: key.organizationId, apiKeyId: key.keyId, day, requests: 1 },
      update: { requests: { increment: 1 } },
    });
  }).catch(() => undefined);
  return key;
}

export async function createApiKey(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; userId: string; name: string; tier: ApiKeyTierName },
): Promise<CreatedApiKey> {
  const trimmed = args.name.trim();
  if (trimmed.length < 3) throw new Error("Give the key a name of at least 3 characters.");
  const { rawKey, keyHash, prefix } = generateApiKey();
  const created = await tx.apiKey.create({
    data: { organizationId: args.organizationId, name: trimmed.slice(0, 120), keyHash, prefix, tier: args.tier, createdById: args.userId },
    select: { id: true, name: true, prefix: true, tier: true },
  });
  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: "API_KEY_CREATED",
    entityType: "ApiKey",
    entityId: created.id,
    details: { name: created.name, tier: created.tier, prefix: created.prefix },
  });
  return { ...created, rawKey };
}

export async function listApiKeys(tx: Prisma.TransactionClient, organizationId: string): Promise<ApiKeyRow[]> {
  return tx.apiKey.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    // Deliberately no keyHash in the selection: nothing that can be read should be able to leak a credential.
    select: { id: true, name: true, prefix: true, tier: true, isActive: true, lastUsedAt: true, createdAt: true, revokedAt: true },
  });
}

export async function revokeApiKey(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; userId: string; keyId: string },
): Promise<{ ok: boolean; error?: string }> {
  const key = await tx.apiKey.findFirst({ where: { id: args.keyId, organizationId: args.organizationId }, select: { id: true, isActive: true } });
  if (!key) return { ok: false, error: "That key no longer exists." };
  if (!key.isActive) return { ok: false, error: "That key is already revoked." };
  await tx.apiKey.update({ where: { id: key.id }, data: { isActive: false, revokedAt: new Date() } });
  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: "API_KEY_REVOKED",
    entityType: "ApiKey",
    entityId: key.id,
    details: {},
  });
  return { ok: true };
}

