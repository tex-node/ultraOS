import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Prisma } from "../src/generated/prisma/client";
import { RecordOrigin } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";

type Manifest = {
  reviewedAt?: string;
  roots: {
    clubs?: string[];
    athletes?: string[];
    staff?: string[];
    events?: string[];
  };
};

const apply = process.argv.includes("--apply");
const manifestArg = process.argv.find((arg) => arg.startsWith("--manifest="));
const manifestPath = manifestArg?.split("=").slice(1).join("=") ?? process.env.REHEARSAL_ORIGIN_MANIFEST;

function assertStagingDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.pathname !== "/ultraos_staging") {
    throw new Error("Refusing rehearsal provenance repair because DATABASE_URL is not ultraos_staging.");
  }
}

function loadManifest(): Manifest {
  if (!manifestPath) throw new Error("A reviewed manifest is required. Pass --manifest=/path/to/manifest.json.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  if (!manifest.roots) throw new Error("Manifest must contain roots.");
  return manifest;
}

async function updateRoot(
  tx: Prisma.TransactionClient,
  model: "club" | "athlete" | "staff" | "event",
  id: string,
  actorUserId: string,
) {
  const current =
    model === "club" ? await tx.club.findUnique({ where: { id }, select: { id: true, recordOrigin: true } }) :
    model === "athlete" ? await tx.athlete.findUnique({ where: { id }, select: { id: true, recordOrigin: true } }) :
    model === "staff" ? await tx.staff.findUnique({ where: { id }, select: { id: true, recordOrigin: true } }) :
    await tx.event.findUnique({ where: { id }, select: { id: true, recordOrigin: true } });
  if (!current) return { id, model, status: "MISSING" };
  if (current.recordOrigin !== RecordOrigin.PRODUCTION) return { id, model, status: "SKIPPED", before: current.recordOrigin, after: current.recordOrigin };
  if (model === "club") await tx.club.update({ where: { id }, data: { recordOrigin: RecordOrigin.REHEARSAL } });
  else if (model === "athlete") await tx.athlete.update({ where: { id }, data: { recordOrigin: RecordOrigin.REHEARSAL } });
  else if (model === "staff") await tx.staff.update({ where: { id }, data: { recordOrigin: RecordOrigin.REHEARSAL } });
  else await tx.event.update({ where: { id }, data: { recordOrigin: RecordOrigin.REHEARSAL } });
  await tx.auditLog.create({
    data: {
      userId: actorUserId,
      action: "REHEARSAL_ORIGIN_REPAIRED",
      entityType: model,
      entityId: id,
      details: { before: current.recordOrigin, after: RecordOrigin.REHEARSAL },
    },
  });
  return { id, model, status: "UPDATED", before: current.recordOrigin, after: RecordOrigin.REHEARSAL };
}

async function main() {
  assertStagingDatabase();
  const manifest = loadManifest();
  const actor = await prisma.user.findFirst({ where: { roles: { some: { role: "SUPER_ADMIN", revokedAt: null } } }, select: { id: true } })
    ?? await prisma.user.findFirst({ select: { id: true } });
  if (!actor) throw new Error("No staging actor user found for audit logs.");
  const roots = manifest.roots;
  const planned = {
    clubs: roots.clubs ?? [],
    athletes: roots.athletes ?? [],
    staff: roots.staff ?? [],
    events: roots.events ?? [],
  };
  const report = apply
    ? await prisma.$transaction(async (tx) => {
        const changes = [
          ...(await Promise.all(planned.clubs.map((id) => updateRoot(tx, "club", id, actor.id)))),
          ...(await Promise.all(planned.athletes.map((id) => updateRoot(tx, "athlete", id, actor.id)))),
          ...(await Promise.all(planned.staff.map((id) => updateRoot(tx, "staff", id, actor.id)))),
          ...(await Promise.all(planned.events.map((id) => updateRoot(tx, "event", id, actor.id)))),
        ];
        return { dryRun: false, manifestPath, changes };
      })
    : { dryRun: true, manifestPath, planned };
  const file = path.join(process.cwd(), `rehearsal-origin-repair-${apply ? "apply" : "dry-run"}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportFile: file }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
