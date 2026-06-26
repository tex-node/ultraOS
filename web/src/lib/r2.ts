import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

const maxUploadBytes = 5 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for file uploads.`);
  }
  return value;
}

function r2Client() {
  return new S3Client({
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
    endpoint:
      process.env.R2_ENDPOINT ??
      `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    region: "auto",
  });
}

function extensionForType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function detectImageType(bytes: Buffer) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type UploadedFile = {
  key: string;
  url: string | null;
  contentType: string;
  size: number;
};

export async function uploadProfilePhoto(file: File, userId: string) {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error("Profile picture must be a JPG, PNG, or WebP image.");
  }
  if (file.size > maxUploadBytes) {
    throw new Error("Profile picture must be 5MB or smaller.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedType = detectImageType(bytes);
  if (!detectedType || detectedType !== file.type) {
    throw new Error("Profile picture content must match a valid JPG, PNG, or WebP image.");
  }

  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  const randomName = crypto.randomBytes(16).toString("hex");
  const key = `applications/profile-photos/${safeUserId}/${Date.now()}-${randomName}.${extensionForType(detectedType)}`;
  await r2Client().send(
    new PutObjectCommand({
      Body: bytes,
      Bucket: requiredEnv("R2_BUCKET"),
      CacheControl: "private, max-age=0, no-store",
      ContentDisposition: "inline",
      ContentType: detectedType,
      Key: key,
      Metadata: {
        uploadedBy: safeUserId,
        uploadPurpose: "application-profile-photo",
      },
    }),
  );

  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return {
    key,
    url: publicBaseUrl ? `${publicBaseUrl}/${key}` : null,
    contentType: detectedType,
    size: file.size,
  } satisfies UploadedFile;
}
