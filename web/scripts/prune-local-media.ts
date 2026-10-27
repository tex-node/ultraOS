import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { mediaLocalRoot, publicBaseUrl } from "../src/lib/media-blob";
import { MediaStorageProvider } from "@/generated/prisma/enums";

// Reclaim the local media disk (streak v18, Prompt 4) - ONLY where the cloud copy is proven.
//
//   npx tsx scripts/prune-local-media.ts              # dry run: what would be deleted, and what is being kept and why
//   npx tsx scripts/prune-local-media.ts --apply      # delete the files that are provably redundant
//
// A file is deleted only when ALL of these hold:
//   1. a MediaAsset row exists for its objectKey;
//   2. that row's storageProvider is CLOUDFLARE_OBJECT_STORAGE;
//   3. its publicUrl is an https URL under the configured public base;
//   4. the file currently answers 200/206 at that URL - checked live, because "the column says R2" is a claim, not a
//      proof, and the whole point of the v17 backfill was that a column can say one thing while the disk says another.
//
// Anything else is KEPT and counted under a reason. Files on disk with no MediaAsset row at all are never touched:
// they might be a variant, a source clip a worker still needs, or an orphan from a crashed run that a human should see.
//
// The database is never modified. Deleting a row would destroy the record that the file ever existed; deleting only
// bytes keeps the asset and its URL, which is exactly what "moved to the cloud" means.

const APPLY = process.argv.includes("--apply");
const orgArg = process.argv.indexOf("--organization");
const ORGANIZATION = orgArg >= 0 ? process.argv[orgArg + 1] : undefined;

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function urlAnswers(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch(url, { method: "GET", headers: { range: "bytes=0-0" } });
    return { ok: response.status === 200 || response.status === 206, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function main() {
  const root = mediaLocalRoot();
  const base = publicBaseUrl();
  console.log(`local media root: ${root}`);
  console.log(`public base URL : ${base || "(unset)"}`);
  console.log(APPLY ? "mode: APPLY (files will be deleted)" : "mode: DRY RUN (nothing will be deleted)");
  console.log("");

  const files = await walk(root);
  if (files.length === 0) {
    console.log("nothing on local disk");
    return;
  }

  const assets = await prisma.mediaAsset.findMany({
    where: ORGANIZATION ? { organizationId: ORGANIZATION } : {},
    select: { id: true, objectKey: true, storageProvider: true, publicUrl: true, byteSize: true },
  });
  const byKey = new Map(assets.map((asset) => [asset.objectKey, asset]));

  let deleted = 0;
  let freed = 0;
  const kept = new Map<string, number>();

  for (const file of files) {
    const relative = file.slice(root.length + 1).replace(/\\/g, "/");
    const asset = byKey.get(relative);
    const keep = (reason: string) => kept.set(reason, (kept.get(reason) ?? 0) + 1);

    if (!asset) {
      keep("no MediaAsset row for this key");
      continue;
    }
    if (asset.storageProvider !== MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE) {
      keep("asset still says LOCAL");
      continue;
    }
    if (!asset.publicUrl || !/^https:\/\//.test(asset.publicUrl) || (base && !asset.publicUrl.startsWith(base))) {
      keep("asset URL is not an https URL under the configured base");
      continue;
    }
    const answer = await urlAnswers(asset.publicUrl);
    if (!answer.ok) {
      keep(`cloud copy did not answer (${answer.status})`);
      continue;
    }
    const size = (await stat(file)).size;
    if (!APPLY) {
      console.log(`  would delete  ${relative}  (${(size / 1024).toFixed(0)} KB, ${asset.publicUrl.slice(0, 60)}…)`);
      deleted += 1;
      freed += size;
      continue;
    }
    try {
      await rm(file);
      deleted += 1;
      freed += size;
    } catch (error) {
      keep(`delete failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("");
  for (const [reason, count] of [...kept.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  kept ${String(count).padStart(4)} · ${reason}`);
  }
  console.log("");
  console.log(
    APPLY
      ? `summary: ${deleted} file(s) deleted, ${(freed / 1024 / 1024).toFixed(2)} MB reclaimed, ${files.length - deleted} kept`
      : `summary: ${deleted} of ${files.length} file(s) would be deleted (${(freed / 1024 / 1024).toFixed(2)} MB); run with --apply`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
