import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { mediaLocalRoot, publicBaseUrl, storeObject, validateMediaConfiguration } from "../src/lib/media-blob";
import { MediaStorageProvider } from "@/generated/prisma/enums";

// Move locally-stored media to R2 (streak v17, Prompt 1).
//
//   npx tsx scripts/backfill-media-to-r2.ts                 # dry run: what would move
//   npx tsx scripts/backfill-media-to-r2.ts --apply         # upload and rewrite the rows
//   npx tsx scripts/backfill-media-to-r2.ts --apply --limit 5
//
// Why this exists: until streak v16 no environment set MEDIA_STORAGE_PROVIDER, so every asset - logos, photos, score
// sheets - was written to local disk with a null publicUrl. The provider is configured now, but the rows written before
// that still point at nothing a browser can fetch.
//
// Safety rules:
//   * dry run is the default; --apply is required to write anything.
//   * a file that is missing on disk is REPORTED and skipped, never "fixed" by writing a URL that does not exist.
//   * the local file is left in place after upload. Deleting it is a separate decision with a separate backup; this
//     script only adds a working URL.
//   * each row is updated only after its own upload succeeds, so a failure leaves that row exactly as it was.

type Candidate = {
  id: string;
  organizationId: string;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  title: string | null;
};

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;
const orgArg = args.indexOf("--organization");
const ORGANIZATION = orgArg >= 0 ? args[orgArg + 1] : undefined;

async function main() {
  const config = validateMediaConfiguration();
  console.log(`provider=${config.provider} cloudflareReady=${config.cloudflareReady} publicBase=${publicBaseUrl() || "(unset)"}`);
  if (!config.cloudflareReady) throw new Error("R2 is not configured in this environment - nothing to backfill to.");
  if (!config.publicBaseUrlConfigured) throw new Error("MEDIA_PUBLIC_BASE_URL / R2_PUBLIC_BASE_URL is unset: uploads would have no URL to store.");

  const localRoot = mediaLocalRoot();
  const candidates = (await prisma.mediaAsset.findMany({
    where: {
      ...(ORGANIZATION ? { organizationId: ORGANIZATION } : {}),
      OR: [{ storageProvider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE }, { publicUrl: null }, { publicUrl: { startsWith: "file://" } }],
    },
    orderBy: { createdAt: "asc" },
    ...(LIMIT ? { take: LIMIT } : {}),
    select: { id: true, organizationId: true, objectKey: true, mimeType: true, byteSize: true, title: true },
  })) as Candidate[];

  console.log(`found ${candidates.length} asset(s) still on local storage${ORGANIZATION ? ` for ${ORGANIZATION}` : ""}`);
  console.log(`local root: ${localRoot}`);
  console.log(APPLY ? "mode: APPLY (uploads and rewrites rows)" : "mode: DRY RUN (nothing will be written)");
  console.log("");

  let uploaded = 0;
  let missing = 0;
  let failed = 0;
  let bytes = 0;

  for (const asset of candidates) {
    const path = join(localRoot, asset.objectKey);
    const exists = await stat(path).then(() => true).catch(() => false);
    if (!exists) {
      missing += 1;
      console.log(`  MISSING  ${asset.id}  ${asset.objectKey}`);
      continue;
    }
    if (!APPLY) {
      const size = (await stat(path)).size;
      bytes += size;
      console.log(`  would upload  ${asset.id}  ${asset.objectKey}  (${(size / 1024).toFixed(0)} KB, ${asset.mimeType})`);
      continue;
    }
    try {
      const body = await readFile(path);
      const publicUrl = await storeObject(MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE, asset.objectKey, body, asset.mimeType);
      if (!publicUrl) throw new Error("the upload produced no public URL");
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { publicUrl, storageProvider: MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE },
      });
      uploaded += 1;
      bytes += body.byteLength;
      console.log(`  uploaded  ${asset.id}  -> ${publicUrl}`);
    } catch (error) {
      failed += 1;
      console.log(`  FAILED    ${asset.id}  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("");
  if (APPLY) {
    console.log(`summary: ${uploaded} uploaded, ${failed} failed, ${missing} missing on disk · ${(bytes / 1024 / 1024).toFixed(2)} MB moved`);
  } else {
    console.log(`summary: ${candidates.length - missing} would move (${(bytes / 1024 / 1024).toFixed(2)} MB), ${missing} missing on disk`);
    console.log("run again with --apply to upload them");
  }
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
