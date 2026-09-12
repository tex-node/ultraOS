import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { ApplicationProvisioningStatus, AthleteGender, DraftSelectionGroup, PlayerStatus, RecordOrigin, UserRole } from "../src/generated/prisma/enums";
import { writeAuditLog } from "../src/lib/audit";
import { ensureAthletePublicId } from "../src/lib/public-ids";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const AKINGBADE_APP_ID = "cmrocxxsk007zfekkktdsqvzy";
const OYEKAN_USER_ID = "cmrocny59007wfekkofnx92ru";
const OYEKAN_ATHLETE_ID = "cmsmm7whz005n2okkbhhrnabz";
const OYEKAN_PLAYER_ID = "cmsmm7wi6005o2okk6uwdz1pv";
const AKINGBADE_EMAIL = "eakingbade23@gmail.com";

async function main() {
  const app = await prisma.application.findUniqueOrThrow({ where: { id: AKINGBADE_APP_ID } });
  const data = app.submittedData as Record<string, unknown>;

  const existingUser = await prisma.user.findUnique({ where: { email: AKINGBADE_EMAIL } });
  if (existingUser) throw new Error(`Refusing: a User already exists for ${AKINGBADE_EMAIL} (${existingUser.id})`);

  const before = {
    applicationId: AKINGBADE_APP_ID,
    applicantUserId: app.applicantUserId,
    sharedUserId: OYEKAN_USER_ID,
    sharedAthleteId: OYEKAN_ATHLETE_ID,
    sharedPlayerId: OYEKAN_PLAYER_ID,
  };

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: AKINGBADE_EMAIL,
        name: "Akingbade Elizabeth",
        passwordHash: await hash(randomUUID(), 12),
        role: UserRole.FAN,
        recordOrigin: RecordOrigin.APPLICATION,
        roles: { create: [{ role: UserRole.FAN, grantedById: ACTOR_ID }, { role: UserRole.PLAYER, grantedById: ACTOR_ID }] },
      },
    });

    const athlete = await tx.athlete.create({
      data: {
        userId: user.id,
        firstName: "Akingbade",
        lastName: "Elizabeth",
        gender: AthleteGender.FEMALE,
        dateOfBirth: new Date("2011-09-21T00:00:00Z"),
        dominantHand: "RIGHT",
        phone: "07057168659",
        email: AKINGBADE_EMAIL,
        emergencyContact: String(data.emergencyContact ?? "") || null,
        previousTeam: "Bobcat basketball academy",
        photoUrl: String(data.profilePhotoUrl ?? data.photoUrl ?? "") || null,
        recordOrigin: RecordOrigin.APPLICATION,
      },
    });
    const ultraAthleteId = await ensureAthletePublicId(tx, athlete.organizationId, athlete.id);

    const season = await tx.season.findFirst({ where: { status: { in: ["ACTIVE", "DRAFT"] } }, orderBy: { startDate: "desc" } });
    let playerId: string | undefined;
    if (season) {
      const player = await tx.player.create({
        data: {
          athleteId: athlete.id,
          seasonId: season.id,
          position: "Shooting guard",
          heightCm: 177,
          weightKg: 65,
          tryoutNumber: null,
          tryoutScore: null,
          selectionNotes: String(data.selectionNotes ?? "") || null,
          status: PlayerStatus.DRAFT_ELIGIBLE,
          draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT,
        },
      });
      playerId = player.id;
    }

    await tx.application.update({
      where: { id: AKINGBADE_APP_ID },
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
      akingbadeUserId: user.id,
      akingbadeAthleteId: athlete.id,
      akingbadePlayerId: playerId ?? null,
      akingbadeUltraAthleteId: ultraAthleteId,
      oyekanUserId: OYEKAN_USER_ID,
      oyekanAthleteId: OYEKAN_ATHLETE_ID,
      oyekanPlayerId: OYEKAN_PLAYER_ID,
    };

    await writeAuditLog(tx, {
      action: "PARTICIPANT_IDENTITY_SPLIT",
      details: {
        reason: "Administrator confirmed Akingbade Elizabeth and Oyekan Aishat are distinct people (already independently classified DISTINCT_PEOPLE in duplicate-identity review). Player internalization had keyed off their shared login User, causing both Applications to resolve to one merged Athlete/Player record (Oyekan's data, processed last, had overwritten the shared row). Shared-login identity association was split before Season Zero Draft.",
        administrator: ACTOR_ID,
        administratorEmail: "texdevices@gmail.com",
        timestamp: new Date().toISOString(),
        applicationId: AKINGBADE_APP_ID,
        before,
        after,
      },
      entityId: AKINGBADE_APP_ID,
      entityType: "Application",
      userId: ACTOR_ID,
    });

    return { user, athlete, playerId, ultraAthleteId };
  });

  console.log(JSON.stringify(result, null, 2));
}

main().finally(() => prisma.$disconnect());
