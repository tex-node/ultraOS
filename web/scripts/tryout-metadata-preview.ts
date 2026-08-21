import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

const acceptedGroups = new Set(["PENDING_SELECTION", "MAIN_DRAFT", "SECONDARY_DRAFT", "NOT_SELECTED"]);

function dataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = String(data[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function groupField(data: Record<string, unknown>) {
  const raw = stringField(data, ["draftSelectionGroup", "selectionGroup", "draftGroup", "draftStatus"]);
  const normalized = raw.toUpperCase().replaceAll(" ", "_").replaceAll("-", "_");
  return normalized || "";
}

async function main() {
  const applications = await prisma.application.findMany({
    where: { type: "PLAYER", status: "APPROVED" },
    include: { applicantUser: { select: { email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const rows = applications.map((application) => {
    const data = dataObject(application.submittedData);
    const selectionGroup = groupField(data);
    const tryoutNumber = stringField(data, ["tryoutNumber", "tryoutNo", "bibNumber"]);
    const tryoutScore = stringField(data, ["tryoutScore", "score", "rating"]);
    const photoUrl = stringField(data, ["photoUrl", "profilePhotoUrl", "imageUrl", "image"]);
    const warnings = [];
    const errors = [];
    if (!selectionGroup) warnings.push("Missing draft selection group.");
    if (selectionGroup && !acceptedGroups.has(selectionGroup)) errors.push("Unrecognized draft selection group.");
    if (!tryoutNumber) warnings.push("Missing tryout number.");
    if (!tryoutScore) warnings.push("Missing tryout score.");
    if (!photoUrl) warnings.push("Missing player photograph.");
    return {
      applicationId: application.id,
      proposedAthlete: "created_or_linked_by_internalization",
      proposedPlayer: "season_zero_registration_by_internalization",
      tryoutNumber: tryoutNumber || null,
      tryoutScore: tryoutScore || null,
      draftSelectionGroup: selectionGroup || null,
      photoAvailable: Boolean(photoUrl),
      selectionNotes: stringField(data, ["selectionNotes", "notes"]) || null,
      warnings,
      errors,
    };
  });
  const tryoutCounts = rows.reduce<Record<string, number>>((acc, row) => {
    if (!row.tryoutNumber) return acc;
    acc[row.tryoutNumber] = (acc[row.tryoutNumber] ?? 0) + 1;
    return acc;
  }, {});
  const duplicateTryoutNumbers = Object.entries(tryoutCounts).filter(([, count]) => count > 1).map(([tryoutNumber]) => tryoutNumber);
  const report = {
    dryRun: true,
    acceptedGroups: [...acceptedGroups],
    source: "Application.submittedData",
    applicationsScanned: applications.length,
    recordsWithSelectionGroup: rows.filter((row) => row.draftSelectionGroup).length,
    recordsWithTryoutNumber: rows.filter((row) => row.tryoutNumber).length,
    recordsWithTryoutScore: rows.filter((row) => row.tryoutScore).length,
    recordsWithPhoto: rows.filter((row) => row.photoAvailable).length,
    duplicateTryoutNumbers,
    unrecognizedSelectionValues: rows.filter((row) => row.errors.some((error) => error.includes("Unrecognized"))).length,
    rows,
  };
  const file = path.join(process.cwd(), `tryout-metadata-preview-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, rows: rows.slice(0, 25), reportFile: file }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
