import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { ApplicationProvisioningStatus, AthleteGender, DraftSelectionGroup, PlayerStatus, RecordOrigin, UserRole } from "../src/generated/prisma/enums";
import { writeAuditLog } from "../src/lib/audit";
import { ensureAthletePublicId } from "../src/lib/public-ids";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const BAKARE_APP_ID = "cmr0mbfns0004z7kk9c35uh24";
const CHIJINDU_USER_ID = "cmqzf51ea0054xbkksk82rmdu";
const CHIJINDU_ATHLETE_ID = "cmr4rw0jz00eoutkkbco9b5sc";
const BAKARE_EMAIL = "bakaremubarakalabi@gmail.com";

async function main() {
  const app = await prisma.application.findUniqueOrThrow({ where: { id: BAKARE_APP_ID } });
  const data = app.submittedData as Record<string, unknown>;

  const before = {
    applicationId: BAKARE_APP_ID,
    applicantUserId: app.applicantUserId,
    sharedUserId: CHIJINDU_USER_ID,
    sharedAthleteId: CHIJINDU_ATHLETE_ID,
  };

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: BAKARE_EMAIL,
        name: "Bakare Mubarak abiodun",
        passwordHash: await hash(randomUUID(), 12),
        role: UserRole.FAN,
        recordOrigin: RecordOrigin.APPLICATION,
        roles: { create: [{ role: UserRole.FAN, grantedById: ACTOR_ID }, { role: UserRole.PLAYER, grantedById: ACTOR_ID }] },
      },
    });

    const athlete = await tx.athlete.create({
      data: {
        userId: user.id,
        firstName: "Bakare",
        lastName: "Mubarak abiodun",
        gender: AthleteGender.MALE,
        dateOfBirth: new Date("2010-01-01T00:00:00Z"),
        dominantHand: "RIGHT",
        phone: "09133677926",
        email: BAKARE_EMAIL,
        emergencyContact: String(data.emergencyContact ?? "") || null,
        previousTeam: "Meteors",
        photoUrl: String(data.profilePhotoUrl ?? data.photoUrl ?? "") || null,
        recordOrigin: RecordOrigin.APPLICATION,
      },
    });
    const ultraAthleteId = await ensureAthletePublicId(tx, athlete.id);

    const season = await tx.season.findFirst({ where: { status: { in: ["ACTIVE", "DRAFT"] } }, orderBy: { startDate: "desc" } });
    let playerId: string | undefined;
    if (season) {
      const player = await tx.player.create({
        data: {
          athleteId: athlete.id,
          seasonId: season.id,
          position: "Shooting guard",
          heightCm: 186,
          weightKg: 75,
          tryoutNumber: null,
          tryoutScore: null,
          selectionNotes: String(data.selectionNotes ?? "") || null,
          status: PlayerStatus.DRAFT_ELIGIBLE,
          draftSelectionGroup: DraftSelectionGroup.SECONDARY_DRAFT,
        },
      });
      playerId = player.id;
    }

    await tx.application.update({
      where: { id: BAKARE_APP_ID },
      data: {
        applicantUserId: user.id,
        provisionedUserId: user.id,
        provisionedAthleteId: athlete.id,
        provisionedPlayerId: playerId,
        provisionedAt: new Date(),
        provisioningStatus: playerId ? ApplicationProvisioningStatus.SEASON_REGISTRATION_CREATED : ApplicationProvisioningStatus.PROFILE_PROVISIONED,
      },
    });

    const after = {
      bakareUserId: user.id,
      bakareAthleteId: athlete.id,
      bakarePlayerId: playerId ?? null,
      bakareUltraAthleteId: ultraAthleteId,
      chijinduUserId: CHIJINDU_USER_ID,
      chijinduAthleteId: CHIJINDU_ATHLETE_ID,
    };

    await writeAuditLog(tx, {
      action: "PARTICIPANT_IDENTITY_SPLIT",
      details: {
        reason: "Administrator confirmed Bakare Mubarak Abiodun and Chijindu Daniel Chukwugorom are distinct people. Shared-login identity association was split before Season Zero Draft.",
        administrator: ACTOR_ID,
        administratorEmail: "texdevices@gmail.com",
        timestamp: new Date().toISOString(),
        applicationId: BAKARE_APP_ID,
        before,
        after,
      },
      entityId: BAKARE_APP_ID,
      entityType: "Application",
      userId: ACTOR_ID,
    });

    return { user, athlete, playerId, ultraAthleteId };
  });

  console.log(JSON.stringify(result, null, 2));
}

main().finally(() => prisma.$disconnect());
