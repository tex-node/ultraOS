import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { ApplicationProvisioningStatus, AthleteGender, DraftSelectionGroup, PlayerStatus, RecordOrigin, UserRole } from "../src/generated/prisma/enums";
import { writeAuditLog } from "../src/lib/audit";
import { ensureAthletePublicId } from "../src/lib/public-ids";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const AKINGBADE_APP_ID = "cmrocxxsk007zfekkktdsqvzy";
const OYEKAN_APP_ID = "cmronk4xh008mfekk0rjzxlxv";
const AKINGBADE_USER_ID = "cmrocny59007wfekkofnx92ru"; // her own pre-existing account
const SHARED_ATHLETE_ID = "cmsmm7whz005n2okkbhhrnabz";
const SHARED_PLAYER_ID = "cmsmm7wi6005o2okk6uwdz1pv";
const OYEKAN_EMAIL = "eibukunoluwa894@gmail.com";

async function main() {
  const akingbadeApp = await prisma.application.findUniqueOrThrow({ where: { id: AKINGBADE_APP_ID } });
  const akingbadeData = akingbadeApp.submittedData as Record<string, unknown>;
  const oyekanApp = await prisma.application.findUniqueOrThrow({ where: { id: OYEKAN_APP_ID } });
  const oyekanData = oyekanApp.submittedData as Record<string, unknown>;

  const conflict = await prisma.user.findUnique({ where: { email: OYEKAN_EMAIL } });
  if (conflict) throw new Error(`Refusing: a User already exists for ${OYEKAN_EMAIL} (${conflict.id})`);

  const before = {
    akingbadeApplicationId: AKINGBADE_APP_ID,
    oyekanApplicationId: OYEKAN_APP_ID,
    sharedUserId: AKINGBADE_USER_ID,
    sharedAthleteId: SHARED_ATHLETE_ID,
    sharedPlayerId: SHARED_PLAYER_ID,
    sharedAthleteContainedOyekanData: true,
  };

  const result = await prisma.$transaction(async (tx) => {
    // Step 1: restore the existing User/Athlete/Player to Akingbade's authoritative data.
    await tx.userRoleAssignment.upsert({
      where: { userId_role: { userId: AKINGBADE_USER_ID, role: UserRole.PLAYER } },
      update: { revokedAt: null, grantedById: ACTOR_ID },
      create: { userId: AKINGBADE_USER_ID, role: UserRole.PLAYER, grantedById: ACTOR_ID },
    });
    await tx.userRoleAssignment.upsert({
      where: { userId_role: { userId: AKINGBADE_USER_ID, role: UserRole.FAN } },
      update: { revokedAt: null },
      create: { userId: AKINGBADE_USER_ID, role: UserRole.FAN, grantedById: ACTOR_ID },
    });

    const akingbadeAthlete = await tx.athlete.update({
      where: { id: SHARED_ATHLETE_ID },
      data: {
        firstName: "Akingbade",
        lastName: "Elizabeth",
        gender: AthleteGender.FEMALE,
        dateOfBirth: new Date("2011-09-21T00:00:00Z"),
        phone: "07057168659",
        email: "eakingbade23@gmail.com",
        emergencyContact: String(akingbadeData.emergencyContact ?? "") || null,
        previousTeam: "Bobcat basketball academy",
        photoUrl: String(akingbadeData.profilePhotoUrl ?? akingbadeData.photoUrl ?? "") || null,
      },
    });
    const akingbadeUltraAthleteId = await ensureAthletePublicId(tx, akingbadeAthlete.id);

    const akingbadePlayer = await tx.player.update({
      where: { id: SHARED_PLAYER_ID },
      data: {
        position: "Shooting guard",
        heightCm: 177,
        weightKg: 65,
        tryoutNumber: null,
        tryoutScore: null,
        selectionNotes: String(akingbadeData.selectionNotes ?? "") || null,
        status: PlayerStatus.DRAFT_ELIGIBLE,
        draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT,
      },
    });

    await tx.application.update({
      where: { id: AKINGBADE_APP_ID },
      data: {
        applicantUserId: AKINGBADE_USER_ID,
        provisionedUserId: AKINGBADE_USER_ID,
        provisionedAthleteId: akingbadeAthlete.id,
        provisionedPlayerId: akingbadePlayer.id,
        provisionedAt: new Date(),
        provisioningStatus: ApplicationProvisioningStatus.SEASON_REGISTRATION_CREATED,
      },
    });

    // Step 2: create Oyekan's own independent identity.
    const oyekanUser = await tx.user.create({
      data: {
        email: OYEKAN_EMAIL,
        name: "Oyekan Aishat",
        passwordHash: await hash(randomUUID(), 12),
        role: UserRole.FAN,
        recordOrigin: RecordOrigin.APPLICATION,
        roles: { create: [{ role: UserRole.FAN, grantedById: ACTOR_ID }, { role: UserRole.PLAYER, grantedById: ACTOR_ID }] },
      },
    });

    const oyekanAthlete = await tx.athlete.create({
      data: {
        userId: oyekanUser.id,
        firstName: "Oyekan",
        lastName: "Aishat",
        gender: AthleteGender.FEMALE,
        dateOfBirth: new Date("2010-01-22T00:00:00Z"),
        dominantHand: "RIGHT",
        phone: "07062477873",
        email: OYEKAN_EMAIL,
        emergencyContact: String(oyekanData.emergencyContact ?? "") || null,
        previousTeam: "Bobcat basketball academy",
        photoUrl: String(oyekanData.profilePhotoUrl ?? oyekanData.photoUrl ?? "") || null,
        recordOrigin: RecordOrigin.APPLICATION,
      },
    });
    const oyekanUltraAthleteId = await ensureAthletePublicId(tx, oyekanAthlete.id);

    const season = await tx.season.findFirst({ where: { status: { in: ["ACTIVE", "DRAFT"] } }, orderBy: { startDate: "desc" } });
    let oyekanPlayerId: string | undefined;
    if (season) {
      const oyekanPlayer = await tx.player.create({
        data: {
          athleteId: oyekanAthlete.id,
          seasonId: season.id,
          position: "Point guard",
          heightCm: 168,
          weightKg: 60,
          tryoutNumber: null,
          tryoutScore: null,
          selectionNotes: String(oyekanData.selectionNotes ?? "") || null,
          status: PlayerStatus.DRAFT_ELIGIBLE,
          draftSelectionGroup: DraftSelectionGroup.MAIN_DRAFT,
        },
      });
      oyekanPlayerId = oyekanPlayer.id;
    }

    await tx.application.update({
      where: { id: OYEKAN_APP_ID },
      data: {
        applicantUserId: oyekanUser.id,
        provisionedUserId: oyekanUser.id,
        provisionedAthleteId: oyekanAthlete.id,
        provisionedPlayerId: oyekanPlayerId,
        provisionedAt: new Date(),
        provisioningStatus: oyekanPlayerId ? ApplicationProvisioningStatus.SEASON_REGISTRATION_CREATED : ApplicationProvisioningStatus.PROFILE_PROVISIONED,
      },
    });

    const after = {
      akingbadeUserId: AKINGBADE_USER_ID,
      akingbadeAthleteId: akingbadeAthlete.id,
      akingbadePlayerId: akingbadePlayer.id,
      akingbadeUltraAthleteId,
      oyekanUserId: oyekanUser.id,
      oyekanAthleteId: oyekanAthlete.id,
      oyekanPlayerId: oyekanPlayerId ?? null,
      oyekanUltraAthleteId,
    };

    await writeAuditLog(tx, {
      action: "SEASON_ZERO_DISTINCT_IDENTITY_SPLIT",
      details: {
        reason: "Administrator confirmed Akingbade Elizabeth and Oyekan Aishat are distinct people. Existing shared-login internalization had overwritten Akingbade's Athlete/Player with Oyekan data. Existing Akingbade User was restored and Oyekan was provisioned as an independent identity.",
        administrator: ACTOR_ID,
        administratorEmail: "texdevices@gmail.com",
        timestamp: new Date().toISOString(),
        akingbadeApplicationId: AKINGBADE_APP_ID,
        oyekanApplicationId: OYEKAN_APP_ID,
        before,
        after,
      },
      entityId: AKINGBADE_APP_ID,
      entityType: "Application",
      userId: ACTOR_ID,
    });

    return { akingbade: { userId: AKINGBADE_USER_ID, athleteId: akingbadeAthlete.id, playerId: akingbadePlayer.id, ultraAthleteId: akingbadeUltraAthleteId }, oyekan: { userId: oyekanUser.id, athleteId: oyekanAthlete.id, playerId: oyekanPlayerId, ultraAthleteId: oyekanUltraAthleteId } };
  });

  console.log(JSON.stringify(result, null, 2));
}

main().finally(() => prisma.$disconnect());
