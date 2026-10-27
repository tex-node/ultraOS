import { prisma } from "@/lib/prisma";
import { MediaStorageProvider } from "@/generated/prisma/enums";

// Deployment configuration with a tracked home (streak v18, Prompt 2).
//
// MEDIA_STORAGE_PROVIDER used to exist only as an environment variable. That is how it went unset in BOTH environments
// for two streaks while R2 credentials sat unused: nothing in the application could see the value, and nothing in the
// UI could show that every asset was landing on a local disk. It now resolves in this order, and the admin screen shows
// WHICH of the three answered:
//
//   1. the environment variable (an operator's explicit override; wins so a deploy can pin a value)
//   2. the SystemConfig row (editable in /admin/settings without a deploy)
//   3. LOCAL_PERSISTENT_STORAGE (what an unconfigured deployment has always done)
export type ConfigSource = "environment" | "database" | "default";

export type ResolvedProvider = {
  provider: MediaStorageProvider;
  source: ConfigSource;
};

export const MEDIA_PROVIDER_KEY = "media.storageProvider";

// A provider read happens on every upload; a short TTL keeps that from being a query per asset without making the admin
// toggle feel like it did nothing.
const CACHE_TTL_MS = 15_000;
let cache: { value: ResolvedProvider; at: number } | null = null;

export function invalidateMediaProviderCache() {
  cache = null;
}

export async function resolveMediaProvider(): Promise<ResolvedProvider> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const fromEnv = process.env.MEDIA_STORAGE_PROVIDER;
  if (fromEnv === MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE) {
    cache = { value: { provider: MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE, source: "environment" }, at: Date.now() };
    return cache.value;
  }
  if (fromEnv === MediaStorageProvider.LOCAL_PERSISTENT_STORAGE) {
    cache = { value: { provider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE, source: "environment" }, at: Date.now() };
    return cache.value;
  }

  const row = await prisma.systemConfig.findUnique({ where: { key: MEDIA_PROVIDER_KEY }, select: { value: true } }).catch(() => null);
  const stored = typeof row?.value === "string" ? row.value : null;
  if (stored === MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE || stored === MediaStorageProvider.LOCAL_PERSISTENT_STORAGE) {
    cache = { value: { provider: stored as MediaStorageProvider, source: "database" }, at: Date.now() };
    return cache.value;
  }

  cache = { value: { provider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE, source: "default" }, at: Date.now() };
  return cache.value;
}

export async function setMediaProvider(provider: MediaStorageProvider, userId: string) {
  await prisma.systemConfig.upsert({
    where: { key: MEDIA_PROVIDER_KEY },
    create: {
      key: MEDIA_PROVIDER_KEY,
      value: provider,
      description: "Where media bytes are written. The MEDIA_STORAGE_PROVIDER environment variable wins when set.",
      updatedById: userId,
    },
    update: { value: provider, updatedById: userId },
  });
  invalidateMediaProviderCache();
}

/** Whether the R2 credentials needed by CLOUDFLARE_OBJECT_STORAGE are actually present. */
export function r2CredentialsPresent(): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!(process.env.MEDIA_S3_ENDPOINT || process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID)) missing.push("R2_ENDPOINT or R2_ACCOUNT_ID");
  if (!(process.env.MEDIA_S3_BUCKET || process.env.R2_BUCKET)) missing.push("R2_BUCKET");
  if (!(process.env.MEDIA_S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID)) missing.push("R2_ACCESS_KEY_ID");
  if (!(process.env.MEDIA_S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY)) missing.push("R2_SECRET_ACCESS_KEY");
  if (!(process.env.MEDIA_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL)) missing.push("R2_PUBLIC_BASE_URL");
  return { ready: missing.length === 0, missing };
}
