// Batch of 7 candidate players from the user's onboarding request. Per instruction: "if any of
// them already exists, defer to existing records on file. update missing information if any."
//
// Dedup check (g16-onboard-batch-check.ts) found:
//   - Egbayelo Peter:           Application only, unprovisioned. No Player yet.
//   - Kukoyi Hassan:            Full Player on file, every field already populated -> no gap.
//   - Bakare Oreoluwa Olohitare: Full Player on file, every field already populated -> no gap.
//   - Alonge Samuel Sylvester:  Full Player on file, weightKg=0 (placeholder gap) -> fill 83kg.
//   - Opeyemi Alagbala:         Full Player on file, weightKg=0 (placeholder gap) -> fill 75kg.
//   - Emmanuel Boluwatife Peace: Full Player on file, exact match on every field -> no gap.
//   - Sanusi Emmanuel:          Full Player on file, every field already populated -> no gap
//                                (submitted weight "6.2" is implausible for any unit and moot anyway).
// This script only touches the two genuine gaps, plus adds an administrative note to Egbayelo
// Peter's still-unprovisioned Application capturing the one new piece of information (weight)
// without altering the applicant's own submittedData.
import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";

async function main() {
  // --- Alonge Samuel Sylvester: weightKg 0 -> 83 (genuine gap; Player.weightKg is a required
  // Int, so 0 here was always a placeholder, never a real measurement). Height/position/DOB on
  // file already match or are close - kept on file per standing instruction on conflicts.
  await prisma.$transaction(async (tx) => {
    const player = await tx.player.findUniqueOrThrow({ where: { id: "cmr4qq66q009vutkkcbup65zy" }, include: { athlete: true } });
    if (player.weightKg !== 0) throw new Error("Alonge weightKg no longer 0 - state changed since dedup check, aborting.");
    await tx.player.update({ where: { id: player.id }, data: { weightKg: 83 } });
    await writeAuditLog(tx, {
      userId: ACTOR_ID,
      action: "PLAYER_PROFILE_CORRECTED",
      entityType: "Player",
      entityId: player.id,
      details: {
        playerName: "Alonge Samuel Sylvester",
        fields: { weightKg: { old: 0, new: 83, note: "Missing on file (0 placeholder); supplied by administrator from freshly-collected offline data (83kg)." } },
        kept_on_file: {
          heightCm: player.heightCm,
          position: player.position,
          dateOfBirth: player.athlete.dateOfBirth.toISOString().slice(0, 10),
          note: "Height (204cm on file vs 207cm given for '6.8'), position, and DOB already present and close to/matching the new submission - kept on file per standing instruction to prefer on-file data on conflict.",
        },
      },
    });
  });
  console.log("Alonge Samuel Sylvester: weightKg 0 -> 83.");

  // --- Opeyemi Alagbala: weightKg 0 -> 75 (same placeholder-gap pattern).
  await prisma.$transaction(async (tx) => {
    const player = await tx.player.findUniqueOrThrow({ where: { id: "cmr4tcnzl00izutkkpqtnur18" }, include: { athlete: true } });
    if (player.weightKg !== 0) throw new Error("Alagbala weightKg no longer 0 - state changed since dedup check, aborting.");
    await tx.player.update({ where: { id: player.id }, data: { weightKg: 75 } });
    await writeAuditLog(tx, {
      userId: ACTOR_ID,
      action: "PLAYER_PROFILE_CORRECTED",
      entityType: "Player",
      entityId: player.id,
      details: {
        playerName: "Alagbala Opeyemi Samuel",
        fields: { weightKg: { old: 0, new: 75, note: "Missing on file (0 placeholder); supplied by administrator from freshly-collected offline data (75kg)." } },
        kept_on_file: {
          heightCm: player.heightCm,
          position: player.position,
          dateOfBirth: player.athlete.dateOfBirth.toISOString().slice(0, 10),
          note: "Height (198cm on file vs 196cm given), position, and DOB (2007-09-29 on file vs 17/09/2006 given - a genuinely different date, not a format ambiguity) already present or in real conflict - kept on file per standing instruction to prefer on-file data on conflict.",
        },
      },
    });
  });
  console.log("Opeyemi Alagbala: weightKg 0 -> 75.");

  // --- Egbayelo Peter: still just a SUBMITTED, unprovisioned Application (not a Player yet).
  // Per the earlier standing instruction on this exact application, submittedData itself is
  // never edited - it's the applicant's own record. The one genuinely new piece of information
  // (weight, absent from the original submission) is captured as an administrative note instead,
  // available to whoever reviews/provisions this application, without rewriting what the
  // applicant actually submitted.
  await prisma.$transaction(async (tx) => {
    const app = await tx.application.findUniqueOrThrow({ where: { id: "cmrqlbtqc00bnfekkskqwqthl" } });
    if (app.notes) throw new Error("Egbayelo Peter application already has notes - aborting to avoid overwriting.");
    const note = "Administrative note (2026-08-17): weight collected directly from applicant via a separate channel - 154lbs (~70kg). Not present in the original application submission. Not merged into submittedData to preserve the applicant's original submission; apply at provisioning time.";
    await tx.application.update({ where: { id: app.id }, data: { notes: note } });
    await writeAuditLog(tx, {
      userId: ACTOR_ID,
      action: "APPLICATION_NOTE_ADDED",
      entityType: "Application",
      entityId: app.id,
      details: { applicantName: "Egbayelo Peter", note },
    });
  });
  console.log("Egbayelo Peter: administrative note added (weight 154lbs / ~70kg) - application itself left untouched, unprovisioned.");

  console.log("\n=== Batch apply complete ===");
}

main().finally(() => prisma.$disconnect());
