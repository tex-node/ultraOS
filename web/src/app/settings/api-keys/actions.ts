"use server";

import { revalidatePath } from "next/cache";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { createApiKey, listApiKeys, revokeApiKey, API_KEY_TIERS, type ApiKeyTierName } from "@/lib/api-v1/api-keys";

// API key management (streak v9, Prompt 2). Same permission as the data feed: handing a partner a credential is
// an operational act. Creating returns the RAW key exactly once; nothing here can read one back.

export type ApiKeyActionState = {
  error?: string;
  created?: { name: string; rawKey: string; tier: string };
  revoked?: { keyId: string; ok: boolean; error?: string };
};

export async function createApiKeyAction(_state: ApiKeyActionState, formData: FormData): Promise<ApiKeyActionState> {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  const name = String(formData.get("name") ?? "").trim();
  const tierInput = String(formData.get("tier") ?? "BASIC");
  const tier: ApiKeyTierName = (API_KEY_TIERS as readonly string[]).includes(tierInput) ? (tierInput as ApiKeyTierName) : "BASIC";
  if (!name) return { error: "Give the key a name so it is identifiable in the list." };
  try {
    const created = await withOrganizationContext(organizationId, (tx) => createApiKey(tx, { organizationId, userId: session.user.id, name, tier }));
    revalidatePath("/settings/api-keys");
    return { created: { name: created.name, rawKey: created.rawKey, tier: created.tier } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function revokeApiKeyAction(_state: ApiKeyActionState, formData: FormData): Promise<ApiKeyActionState> {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  const keyId = String(formData.get("keyId") ?? "");
  if (!keyId) return { error: "Missing key." };
  const result = await withOrganizationContext(organizationId, (tx) => revokeApiKey(tx, { organizationId, userId: session.user.id, keyId }));
  revalidatePath("/settings/api-keys");
  return { revoked: { keyId, ok: result.ok, error: result.error } };
}

/** Used by the page itself (a read, not an action) - exported so the page does not need its own import cycle. */
export async function loadApiKeys() {
  const { organizationId } = await requirePermissionWithOrganization("operations:manage");
  return withOrganizationContext(organizationId, (tx) => listApiKeys(tx, organizationId));
}
