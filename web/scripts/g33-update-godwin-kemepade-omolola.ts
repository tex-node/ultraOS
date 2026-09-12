import { writeAuditLog } from "../src/lib/audit";
import { provisionPlayerOfflineIntake, updateAdminOfflineIntakePlayerProfile } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

// Phase 1 Stage 5.5B: admin-offline-intake.ts functions now require an explicit
// organizationId - this historical one-off script always meant Neon Ultra.
const NEON_ULTRA_ORGANIZATION_ID = "cmt4odhgn0000wokk8fbwr6ro";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";

function feetInchesToCm(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54);
}
function decimalFeetToCm(feet: number) {
  return Math.round(feet * 30.48);
}

async function main() {
  // Godwin Nneoma: real Player already. DOB on file (2026-10-24) is an impossible future
  // date - correcting the year only, same day/month as given, is a genuine error fix, not
  // a conflict. Weight (0) is a data gap. Position (Center on file vs Power forward given)
  // is a real conflict - per instruction, keep on-file. Height (189 on file vs 188 given)
  // is within rounding tolerance - keep on-file.
  const GODWIN_PLAYER_ID = "cmrhvoq7q000g0xkkkcm2i31w";
  await prisma.$transaction(async (tx) => {
    const athlete = await tx.player.findUniqueOrThrow({ where: { id: GODWIN_PLAYER_ID }, include: { athlete: true } });
    await tx.athlete.update({ where: { id: athlete.athleteId }, data: { dateOfBirth: new Date("2009-10-24") } });
    await tx.player.update({ where: { id: GODWIN_PLAYER_ID }, data: { weightKg: 75 } });
    await writeAuditLog(tx, {
      action: "PLAYER_PROFILE_CORRECTED",
      details: {
        fields: {
          dateOfBirth: { new: "2009-10-24", note: "On-file value (2026-10-24) was an impossible future date; corrected year only, same day/month as administrator-supplied data.", old: "2026-10-24" },
          weightKg: { new: 75, old: 0 },
        },
        kept_on_file: { heightCm: 189, note: "Position (Center) kept on file per standing instruction to prefer on-file data on conflict; height (189cm vs 188cm given) within rounding tolerance.", position: "Center" },
        playerName: "Godwin Nneoma",
      },
      entityId: GODWIN_PLAYER_ID,
      entityType: "Player",
      userId: ACTOR_ID,
    });
  });
  console.log("Godwin Nneoma: DOB corrected to 2009-10-24, weightKg 0 -> 75. Position/height kept on file.");

  // Kemepade Precious - offline intake, no existing conflicts.
  const KEMEPADE_INTAKE_ID = "cmsoqoynu000agckkz4ix96ay";
  await updateAdminOfflineIntakePlayerProfile(NEON_ULTRA_ORGANIZATION_ID, 
    KEMEPADE_INTAKE_ID,
    { dateOfBirth: "2008-10-02", dominantHand: "RIGHT", heightCm: decimalFeetToCm(6.3), position: "Small forward / Power forward", weightKg: 70 },
    ACTOR_ID,
  );
  const kemepadeResult = await provisionPlayerOfflineIntake(NEON_ULTRA_ORGANIZATION_ID, KEMEPADE_INTAKE_ID, SEASON_ID, ACTOR_ID);
  console.log(kemepadeResult.alreadyProvisioned ? "Kemepade: already provisioned" : `Kemepade Precious: provisioned -> playerId=${kemepadeResult.player.id}`);

  // Omolola Adeseke Rachael - offline intake, no existing conflicts.
  const OMOLOLA_INTAKE_ID = "cmsoqoyot000egckkargbbbe9";
  await updateAdminOfflineIntakePlayerProfile(NEON_ULTRA_ORGANIZATION_ID, 
    OMOLOLA_INTAKE_ID,
    { dateOfBirth: "2009-04-21", dominantHand: "RIGHT", heightCm: feetInchesToCm(5, 10), position: "Small forward", weightKg: 60 },
    ACTOR_ID,
  );
  const omololaResult = await provisionPlayerOfflineIntake(NEON_ULTRA_ORGANIZATION_ID, OMOLOLA_INTAKE_ID, SEASON_ID, ACTOR_ID);
  console.log(omololaResult.alreadyProvisioned ? "Omolola: already provisioned" : `Omolola Adeseke Rachael: provisioned -> playerId=${omololaResult.player.id}`);
}

main().finally(() => prisma.$disconnect());
