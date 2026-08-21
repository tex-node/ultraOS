import assert from "node:assert/strict";
import test from "node:test";
import { MediaAssetPurpose } from "@/generated/prisma/enums";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

let mediaStorageModule: typeof import("@/lib/media-storage") | null = null;

async function loadMediaStorage() {
  mediaStorageModule ??= await import("@/lib/media-storage");
  return mediaStorageModule;
}

test("media image detection accepts only supported magic bytes", async () => {
  const { detectImageType } = await loadMediaStorage();
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
  assert.equal(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectImageType(Buffer.from("RIFFxxxxWEBP", "ascii")), "image/webp");
  assert.equal(detectImageType(Buffer.from("<script>alert(1)</script>", "utf8")), null);
});

test("media object keys are scoped and sanitized", async () => {
  const { safeObjectKey } = await loadMediaStorage();
  const key = safeObjectKey({
    mimeType: "image/png",
    purpose: MediaAssetPurpose.PLAYER_PROFILE_PHOTO,
    uploadedById: "../unsafe user!",
  });
  assert.match(key, /^originals\/player_profile_photo\/unsafeuser\/\d+-[a-f0-9]{32}\.png$/);
});

test("media configuration defaults to local persistent storage", async () => {
  const { validateMediaConfiguration } = await loadMediaStorage();
  const config = validateMediaConfiguration();
  assert.equal(config.provider, "LOCAL_PERSISTENT_STORAGE");
  assert.equal(config.localReady, true);
});

test("media extension mapping is deterministic", async () => {
  const { extensionForMime } = await loadMediaStorage();
  assert.equal(extensionForMime("image/png"), "png");
  assert.equal(extensionForMime("image/webp"), "webp");
  assert.equal(extensionForMime("image/jpeg"), "jpg");
});
