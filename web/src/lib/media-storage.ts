import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { Prisma } from "@/generated/prisma/client";
import {
  MediaAssetPurpose,
  MediaAssetStatus,
  MediaStorageProvider,
  MediaVisibility,
  PublicResourceLocatorType,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { assertSameOrganization } from "@/lib/authorization";
import { upsertPublicResourceLocator } from "@/lib/public-locators";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const profileMaxBytes = 15 * 1024 * 1024;
const logoMaxBytes = 10 * 1024 * 1024;

// Phase 1 Stage 5.2A: this shared domain never decides which tenant is active - every function
// below takes `tx` (a transaction already opened by the caller's own withOrganizationContext())
// and `organizationId` explicitly, and stamps organizationId onto every row it creates. It never
// imports session/auth logic itself and never accepts an organizationId from form/request input -
// the caller (a server action that already resolved it from the authenticated session) is the
// only trusted source.
export type MediaUploadInput = {
  tx: Prisma.TransactionClient;
  organizationId: string;
  file: File;
  purpose: MediaAssetPurpose;
  visibility?: MediaVisibility;
  uploadedById: string;
  title?: string;
  altText?: string;
  caption?: string;
};

export type MediaAssignmentTarget = {
  entityType: "Club" | "Athlete" | "Staff";
  entityId: string;
  purpose: MediaAssetPurpose;
};

function configuredProvider() {
  const value = process.env.MEDIA_STORAGE_PROVIDER;
  if (value === MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE) return MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE;
  return MediaStorageProvider.LOCAL_PERSISTENT_STORAGE;
}

export function mediaLocalRoot() {
  if (process.env.MEDIA_LOCAL_ROOT) return process.env.MEDIA_LOCAL_ROOT;
  if (process.cwd().includes("/opt/ultraos-staging/")) return "/opt/ultraos-staging/shared/media";
  return path.join(/* turbopackIgnore: true */ process.cwd(), ".media");
}

function publicBaseUrl() {
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

export function detectImageType(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function safeObjectKey(params: { purpose: MediaAssetPurpose; uploadedById: string; mimeType: string; variant?: string }) {
  const safeUser = params.uploadedById.replace(/[^a-zA-Z0-9_-]/g, "");
  const randomName = crypto.randomBytes(16).toString("hex");
  const ext = extensionForMime(params.mimeType);
  const prefix = params.variant ? "variants" : "originals";
  return `${prefix}/${params.purpose.toLowerCase()}/${safeUser}/${Date.now()}-${randomName}.${ext}`;
}

function maxBytesForPurpose(purpose: MediaAssetPurpose) {
  return purpose === MediaAssetPurpose.CLUB_LOGO || purpose === MediaAssetPurpose.CLUB_SECONDARY_LOGO ? logoMaxBytes : profileMaxBytes;
}

export async function validateImageFile(file: File, purpose: MediaAssetPurpose) {
  if (!allowedImageTypes.has(file.type)) throw new Error("Only JPG, PNG, or WebP images are supported.");
  if (file.size > maxBytesForPurpose(purpose)) throw new Error(`File is too large for ${purpose}.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedType = detectImageType(bytes);
  if (!detectedType || detectedType !== file.type) throw new Error("File content does not match the declared image type.");
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Unable to determine image dimensions.");
  return {
    bytes,
    checksumSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    height: metadata.height,
    mimeType: detectedType,
    width: metadata.width,
  };
}

async function storeObject(provider: MediaStorageProvider, key: string, body: Buffer, mimeType: string) {
  if (provider === MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE) {
    await s3Client().send(new PutObjectCommand({
      Body: body,
      Bucket: requiredEnv("MEDIA_S3_BUCKET", "R2_BUCKET"),
      CacheControl: "public, max-age=31536000, immutable",
      ContentDisposition: "inline",
      ContentType: mimeType,
      Key: key,
    }));
    const baseUrl = publicBaseUrl();
    return baseUrl ? `${baseUrl}/${key}` : null;
  }

  const fullPath = path.join(mediaLocalRoot(), key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, body);
  return null;
}

async function variantBuffer(bytes: Buffer, purpose: MediaAssetPurpose, variant: string) {
  const image = sharp(bytes, { animated: false }).rotate();
  const isLogo = purpose === MediaAssetPurpose.CLUB_LOGO || purpose === MediaAssetPurpose.CLUB_SECONDARY_LOGO;
  if (isLogo && variant === "display-large") return image.resize({ width: 800, height: 800, fit: "contain", withoutEnlargement: true }).toBuffer();
  if (isLogo && variant === "display-small") return image.resize({ width: 240, height: 240, fit: "contain", withoutEnlargement: true }).toBuffer();
  if (variant === "profile-medium") return image.resize({ width: 640, height: 640, fit: "cover", withoutEnlargement: true }).toBuffer();
  if (variant === "profile-small") return image.resize({ width: 180, height: 180, fit: "cover", withoutEnlargement: true }).toBuffer();
  return bytes;
}

function variantsForPurpose(purpose: MediaAssetPurpose) {
  if (purpose === MediaAssetPurpose.CLUB_LOGO || purpose === MediaAssetPurpose.CLUB_SECONDARY_LOGO) return ["display-large", "display-small"];
  if (purpose === MediaAssetPurpose.PLAYER_PROFILE_PHOTO || purpose === MediaAssetPurpose.COACH_PROFILE_PHOTO || purpose === MediaAssetPurpose.STAFF_PROFILE_PHOTO) return ["profile-medium", "profile-small"];
  return [];
}

export async function uploadMediaAsset(input: MediaUploadInput) {
  const { tx, organizationId } = input;
  const provider = configuredProvider();
  const validated = await validateImageFile(input.file, input.purpose);
  const key = safeObjectKey({ purpose: input.purpose, uploadedById: input.uploadedById, mimeType: validated.mimeType });
  const storedPublicUrl = await storeObject(provider, key, validated.bytes, validated.mimeType);

  const asset = await tx.mediaAsset.create({
    data: {
      organizationId,
      byteSize: input.file.size,
      checksumSha256: validated.checksumSha256,
      height: validated.height,
      mimeType: validated.mimeType,
      objectKey: key,
      originalFilename: input.file.name.replace(/[^\w.\- ]/g, "").slice(0, 180) || null,
      publicUrl: storedPublicUrl,
      purpose: input.purpose,
      status: MediaAssetStatus.READY,
      storageProvider: provider,
      title: input.title || null,
      altText: input.altText || null,
      caption: input.caption || null,
      uploadedById: input.uploadedById,
      visibility: input.visibility ?? MediaVisibility.PRIVATE,
      width: validated.width,
    },
  });
  await upsertPublicResourceLocator(tx, {
    resourceType: PublicResourceLocatorType.MEDIA_ASSET,
    publicKey: asset.id,
    organizationId,
    resourceId: asset.id,
  });

  for (const variant of variantsForPurpose(input.purpose)) {
    const buffer = await variantBuffer(validated.bytes, input.purpose, variant);
    const metadata = await sharp(buffer).metadata();
    const variantKey = safeObjectKey({ purpose: input.purpose, uploadedById: input.uploadedById, mimeType: validated.mimeType, variant });
    const variantPublicUrl = await storeObject(provider, variantKey, buffer, validated.mimeType);
    await tx.mediaAssetVariant.create({
      data: {
        organizationId,
        assetId: asset.id,
        byteSize: buffer.length,
        checksumSha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        height: metadata.height ?? null,
        mimeType: validated.mimeType,
        name: variant,
        objectKey: variantKey,
        publicUrl: variantPublicUrl,
        storageProvider: provider,
        width: metadata.width ?? null,
      },
    });
  }

  await writeAuditLog(tx, {
    organizationId,
    action: "MEDIA_ASSET_UPLOADED",
    entityId: asset.id,
    entityType: "MediaAsset",
    userId: input.uploadedById,
    details: { purpose: input.purpose, provider, visibility: input.visibility ?? MediaVisibility.PRIVATE },
  });

  return asset;
}

export async function assignPrimaryMediaAsset(
  tx: Prisma.TransactionClient,
  organizationId: string,
  target: MediaAssignmentTarget,
  assetId: string,
  userId: string,
) {
  const asset = await tx.mediaAsset.findUnique({ where: { id: assetId } });
  assertSameOrganization(asset, organizationId, "Media asset");
  await tx.mediaAssetUsage.updateMany({
    where: { entityType: target.entityType, entityId: target.entityId, purpose: target.purpose, isPrimary: true, active: true },
    data: { active: false },
  });
  const usage = await tx.mediaAssetUsage.create({
    data: {
      organizationId,
      assetId,
      assignedById: userId,
      entityId: target.entityId,
      entityType: target.entityType,
      isPrimary: true,
      purpose: target.purpose,
    },
  });
  const publicUrl = asset.publicUrl ?? `/media/assets/${asset.id}/file`;
  if (target.entityType === "Club" && (target.purpose === MediaAssetPurpose.CLUB_LOGO || target.purpose === MediaAssetPurpose.CLUB_SECONDARY_LOGO)) {
    const club = await tx.club.findUnique({ where: { id: target.entityId } });
    assertSameOrganization(club, organizationId, "Club");
    await tx.club.update({ where: { id: target.entityId }, data: { logoUrl: publicUrl } });
  }
  if (target.entityType === "Athlete" && target.purpose === MediaAssetPurpose.PLAYER_PROFILE_PHOTO) {
    const athlete = await tx.athlete.findUnique({ where: { id: target.entityId } });
    assertSameOrganization(athlete, organizationId, "Athlete");
    await tx.athlete.update({ where: { id: target.entityId }, data: { photoUrl: publicUrl } });
  }
  if (target.entityType === "Staff" && (target.purpose === MediaAssetPurpose.COACH_PROFILE_PHOTO || target.purpose === MediaAssetPurpose.STAFF_PROFILE_PHOTO)) {
    const staff = await tx.staff.findUnique({ where: { id: target.entityId } });
    assertSameOrganization(staff, organizationId, "Staff");
    await tx.staff.update({ where: { id: target.entityId }, data: { photoUrl: publicUrl } });
  }
  await writeAuditLog(tx, {
    organizationId,
    action: "MEDIA_ASSET_PRIMARY_ASSIGNED",
    entityId: assetId,
    entityType: "MediaAsset",
    userId,
    details: target satisfies Prisma.InputJsonObject,
  });
  return usage;
}

export async function approveMediaAsset(tx: Prisma.TransactionClient, organizationId: string, assetId: string, userId: string) {
  const asset = await tx.mediaAsset.findUnique({ where: { id: assetId } });
  assertSameOrganization(asset, organizationId, "Media asset");
  await tx.mediaAsset.update({ where: { id: assetId }, data: { status: MediaAssetStatus.READY } });
  await writeAuditLog(tx, { organizationId, action: "MEDIA_ASSET_APPROVED", entityId: assetId, entityType: "MediaAsset", userId });
}

export async function archiveMediaAsset(tx: Prisma.TransactionClient, organizationId: string, assetId: string, userId: string) {
  const asset = await tx.mediaAsset.findUnique({ where: { id: assetId } });
  assertSameOrganization(asset, organizationId, "Media asset");
  await tx.mediaAsset.update({ where: { id: assetId }, data: { status: MediaAssetStatus.ARCHIVED } });
  await tx.mediaAssetUsage.updateMany({ where: { assetId }, data: { active: false } });
  await writeAuditLog(tx, { organizationId, action: "MEDIA_ASSET_ARCHIVED", entityId: assetId, entityType: "MediaAsset", userId });
}

export async function readLocalMediaObject(objectKey: string) {
  const normalized = path.normalize(objectKey).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(mediaLocalRoot(), normalized);
  if (!fullPath.startsWith(path.resolve(mediaLocalRoot()))) throw new Error("Invalid media object key.");
  return readFile(fullPath);
}
