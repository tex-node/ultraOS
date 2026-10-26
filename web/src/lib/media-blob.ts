import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { MediaAssetStatus, MediaStorageProvider, MediaVisibility, type MediaAssetPurpose } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

// Byte storage with no framework imports (streak v16, Prompt 1).
//
// This module holds the parts of media storage that only need bytes: the provider switch, the object key, the S3/R2
// upload and the local fallback. It deliberately imports NOTHING from next/* or from authorization - which is what
// lets it be used from a worker or a script (an ffmpeg highlight job runs outside a request) without dragging the
// Next router and React into the process. media-storage.ts keeps the image pipeline, validation and locator logic and
// re-exports these, so there is still one storage implementation, not two.

export function configuredProvider(): MediaStorageProvider {
  const value = process.env.MEDIA_STORAGE_PROVIDER;
  if (value === MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE) return MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE;
  return MediaStorageProvider.LOCAL_PERSISTENT_STORAGE;
}

export function mediaLocalRoot() {
  if (process.env.MEDIA_LOCAL_ROOT) return process.env.MEDIA_LOCAL_ROOT;
  if (process.cwd().includes("/opt/ultraos-staging/")) return "/opt/ultraos-staging/shared/media";
  if (process.cwd().includes("/opt/ultraleagueos/")) return "/opt/ultraleagueos/shared/media";
  return path.join(process.cwd(), ".media");
}

export function publicBaseUrl() {
  return (process.env.MEDIA_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
}

function requiredEnv(name: string, fallbackName?: string) {
  const value = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) throw new Error(`${name} is required for configured media storage.`);
  return value;
}

function s3Client() {
  return new S3Client({
    credentials: {
      accessKeyId: requiredEnv("MEDIA_S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("MEDIA_S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"),
    },
    endpoint: process.env.MEDIA_S3_ENDPOINT ?? process.env.R2_ENDPOINT ?? `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    region: "auto",
  });
}

export function validateMediaConfiguration() {
  const provider = configuredProvider();
  return {
    provider,
    cloudflareReady: Boolean(
      (process.env.MEDIA_S3_ENDPOINT || process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID) &&
        (process.env.MEDIA_S3_BUCKET || process.env.R2_BUCKET) &&
        (process.env.MEDIA_S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID) &&
        (process.env.MEDIA_S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY),
    ),
    localReady: Boolean(mediaLocalRoot()),
    publicBaseUrlConfigured: Boolean(publicBaseUrl()),
  };
}

export function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  // Video (streak v16): a highlight is mp4, and a .jpg extension on an mp4 breaks both the CDN content type and any
  // player that sniffs by extension.
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  return "jpg";
}

export function safeObjectKey(params: { purpose: MediaAssetPurpose; uploadedById: string; mimeType: string; variant?: string }) {
  const safeUser = params.uploadedById.replace(/[^a-zA-Z0-9_-]/g, "");
  const randomName = crypto.randomBytes(16).toString("hex");
  const ext = extensionForMime(params.mimeType);
  const prefix = params.variant ? "variants" : "originals";
  return `${prefix}/${params.purpose.toLowerCase()}/${safeUser}/${Date.now()}-${randomName}.${ext}`;
}

export async function storeObject(provider: MediaStorageProvider, key: string, body: Buffer, mimeType: string) {
  if (provider === MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE) {
    await s3Client().send(
      new PutObjectCommand({
        Body: body,
        Bucket: requiredEnv("MEDIA_S3_BUCKET", "R2_BUCKET"),
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: "inline",
        ContentType: mimeType,
        Key: key,
      }),
    );
    const baseUrl = publicBaseUrl();
    return baseUrl ? `${baseUrl}/${key}` : null;
  }

  const fullPath = path.join(mediaLocalRoot(), key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, body);
  return null;
}

/**
 * Store arbitrary bytes as a media asset and return the provider's public URL (or null).
 *
 * Video has to go through the same storage decision as images - R2 when configured, local disk otherwise - without the
 * image pipeline (sharp validation and variants make no sense for an mp4).
 */
export async function storeMediaBytes(input: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  bytes: Buffer;
  mimeType: string;
  purpose: MediaAssetPurpose;
  uploadedById: string;
  originalFilename?: string | null;
  title?: string | null;
  source?: string | null;
  visibility?: MediaVisibility;
}): Promise<{ id: string; objectKey: string; publicUrl: string | null; storageProvider: MediaStorageProvider }> {
  const provider = configuredProvider();
  const key = safeObjectKey({ purpose: input.purpose, uploadedById: input.uploadedById, mimeType: input.mimeType });
  const storedPublicUrl = await storeObject(provider, key, input.bytes, input.mimeType);
  const asset = await input.tx.mediaAsset.create({
    data: {
      organizationId: input.organizationId,
      byteSize: input.bytes.byteLength,
      checksumSha256: crypto.createHash("sha256").update(input.bytes).digest("hex"),
      mimeType: input.mimeType,
      objectKey: key,
      originalFilename: input.originalFilename ?? null,
      publicUrl: storedPublicUrl,
      purpose: input.purpose,
      status: MediaAssetStatus.READY,
      storageProvider: provider,
      title: input.title ?? null,
      source: input.source ?? null,
      uploadedById: input.uploadedById,
      visibility: input.visibility ?? MediaVisibility.PUBLIC,
    },
    select: { id: true },
  });
  return { id: asset.id, objectKey: key, publicUrl: storedPublicUrl, storageProvider: provider };
}
