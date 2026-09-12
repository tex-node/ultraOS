import { AthleteGender, DraftSelectionGroup, PlayerStatus, RecordOrigin, UserRole } from "../src/generated/prisma/enums";
import { writeAuditLog } from "../src/lib/audit";
import { ensureAthletePublicId } from "../src/lib/public-ids";
import { prisma } from "../src/lib/prisma";
import { upsertRoleAssignment } from "../src/lib/user-roles";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const APPLICATION_ID = "cmrqftl8u00bjfekkmhl91nh0";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";

function decimalFeetToCm(feet: number) {
  return Math.round(feet * 30.48);
}

async function main() {
  const application = await prisma.application.findUniqueOrThrow({ where: { id: APPLICATION_ID } });
  const data = application.submittedData as Record<string, unknown>;
  const photoUrl = (data.profilePhoto as { url?: string } | undefined)?.url ?? null;

  const existingAthlete = await prisma.athlete.findFirst({ where: { userId: application.applicantUserId ?? undefined } });
  if (existingAthlete) {
    console.log("An Athlete already exists for this identity:", existingAthlete.id, "- stopping.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: application.applicantUserId! },
      data: { name: "Igwebuike Oluchukwu Sylvia" },
    });
    await upsertRoleAssignment(tx, { userId: user.id, role: UserRole.PLAYER, grantedById: ACTOR_ID });

    const athlete = await tx.athlete.create({
      data: {
        dateOfBirth: new Date(String(data.dateOfBirth)),
        dominantHand: "RIGHT",
        email: user.email,
        firstName: "Igwebuike",
        gender: AthleteGender.FEMALE,
        lastName: "Oluchukwu Sylvia",
        phone: String(data.phone ?? ""),
        photoUrl,
        previousTeam: typeof data.academyTeam === "string" ? data.academyTeam : null,
        recordOrigin: RecordOrigin.APPLICATION,
        userId: user.id,
      },
    });
    await ensureAthletePublicId(tx, athlete.organizationId, athlete.id);

    const player = await tx.player.create({
      data: {
        athleteId: athlete.id,
        draftSelectionGroup: DraftSelectionGroup.SECONDARY_DRAFT,
        heightCm: decimalFeetToCm(5.9),
        position: "Power forward",
        seasonId: SEASON_ID,
        status: PlayerStatus.DRAFT_ELIGIBLE,
        weightKg: 82,
      },
    });

    await writeAuditLog(tx, {
      action: "PARTICIPANT_NAME_CORRECTED_ON_INTERNALIZATION",
      details: { athleteId: athlete.id, correctedName: "Igwebuike Oluchukwu Sylvia", note: "Submitted Application fullName was truncated to 'Oluchukwu Igwebuike'; the linked User account already had the correct full name.", originalSubmittedName: String(data.fullName ?? ""), playerId: player.id },
      entityId: athlete.id,
      entityType: "Athlete",
      userId: ACTOR_ID,
    });

    console.log("Athlete:", athlete.id, "Player:", player.id);
  });
}

main().finally(() => prisma.$disconnect());
