import { AthleteGender, DraftSelectionGroup, PlayerStatus, RecordOrigin, UserRole } from "../src/generated/prisma/enums";
import { writeAuditLog } from "../src/lib/audit";
import { ensureAthletePublicId } from "../src/lib/public-ids";
import { prisma } from "../src/lib/prisma";
import { upsertRoleAssignment } from "../src/lib/user-roles";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const APPLICATION_ID = "cmron147h008kfekkpnipwqdn";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const CORRECT_FIRST_NAME = "Emmanuel";
const CORRECT_LAST_NAME = "Jacob";
const CORRECTION_NOTE =
  "Submitted online as 'Emmanuel Tomiwa'; administrator directly confirmed this is the same real person " +
  "and 'Jacob' is the name to use going forward. Original Application.submittedData is left untouched as the " +
  "historical record of what was actually submitted; only the resulting Athlete carries the corrected name.";

function feetToCm(feet: string) {
  const parsed = Number(feet);
  return Number.isFinite(parsed) ? Math.round(parsed * 30.48) : 183;
}

async function main() {
  const application = await prisma.application.findUniqueOrThrow({ where: { id: APPLICATION_ID } });
  if (application.status === "APPROVED") {
    console.log("Application already APPROVED - continuing to check internalization.");
  }
  const data = application.submittedData as Record<string, unknown>;
  const email = String(data.email ?? "").toLowerCase();
  const phone = String(data.phone ?? "");
  const photoUrl = (data.profilePhoto as { url?: string } | undefined)?.url ?? null;
  const heightCm = feetToCm(String(data.heightFeet ?? "6"));

  const existingAthlete = await prisma.athlete.findFirst({ where: { OR: [{ email }, { userId: application.applicantUserId ?? undefined }] } });
  if (existingAthlete) {
    console.log("An Athlete already exists for this identity:", existingAthlete.id, "- stopping, not touching it.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (application.status !== "APPROVED") {
      await tx.application.update({ where: { id: APPLICATION_ID }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: ACTOR_ID } });
      await writeAuditLog(tx, {
        action: "SEASON_ZERO_PLAYER_APPLICATION_APPROVED",
        details: { name: `${data.fullName}`, newStatus: "APPROVED", oldStatus: application.status, reason: "Approved for Season Zero after administrator identity confirmation (name correction to Emmanuel Jacob)." },
        entityId: APPLICATION_ID,
        entityType: "Application",
        userId: ACTOR_ID,
      });
    }

    const user = await tx.user.update({
      where: { id: application.applicantUserId! },
      data: { name: `${CORRECT_FIRST_NAME} ${CORRECT_LAST_NAME}` },
    });
    await upsertRoleAssignment(tx, { userId: user.id, role: UserRole.PLAYER, grantedById: ACTOR_ID });

    const athlete = await tx.athlete.create({
      data: {
        dateOfBirth: new Date(String(data.dateOfBirth)),
        dominantHand: "RIGHT",
        email,
        firstName: CORRECT_FIRST_NAME,
        gender: AthleteGender.MALE,
        lastName: CORRECT_LAST_NAME,
        phone,
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
        heightCm,
        position: "Point guard",
        seasonId: SEASON_ID,
        status: PlayerStatus.DRAFT_ELIGIBLE,
        weightKg: 65,
      },
    });

    await writeAuditLog(tx, {
      action: "PARTICIPANT_NAME_CORRECTED_ON_INTERNALIZATION",
      details: { athleteId: athlete.id, correctedName: `${CORRECT_FIRST_NAME} ${CORRECT_LAST_NAME}`, note: CORRECTION_NOTE, originalSubmittedName: String(data.fullName ?? ""), playerId: player.id },
      entityId: athlete.id,
      entityType: "Athlete",
      userId: ACTOR_ID,
    });

    console.log("Athlete:", athlete.id, "Player:", player.id, "heightCm:", heightCm);
  });
}

main().finally(() => prisma.$disconnect());
