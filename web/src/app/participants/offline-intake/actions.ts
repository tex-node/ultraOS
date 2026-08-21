"use server";

import { revalidatePath } from "next/cache";
import { ApplicationType, AthleteGender, CoachSeasonZeroDivision, CoachSeasonZeroSelectionStatus } from "@/generated/prisma/enums";
import {
  createAdminOfflineIntake,
  provisionAdminOfflineIntake,
  provisionPlayerOfflineIntake,
  updateAdminOfflineIntakeContact,
  updateAdminOfflineIntakePlayerProfile,
  type PlayerProfile,
} from "@/lib/admin-offline-intake";
import { requirePermission } from "@/lib/authorization";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

export type OfflineIntakeFormState = {
  error?: string;
  duplicateMatches?: Array<{ source: string; id: string; name: string; email: string | null; phone: string | null; matchedOn: string }>;
  createdId?: string;
};

export async function submitOfflineIntake(_state: OfflineIntakeFormState, formData: FormData): Promise<OfflineIntakeFormState> {
  const session = await requirePermission("staff:manage");
  const participantType = value(formData, "participantType") as ApplicationType;
  if (!Object.values(ApplicationType).includes(participantType)) {
    return { error: "Select a valid participant type." };
  }
  const fullName = value(formData, "fullName");
  if (!fullName) return { error: "Full name is required." };

  const divisionInput = value(formData, "coachSeasonZeroDivision");
  const selectionInput = value(formData, "coachSeasonZeroSelectionStatus") as CoachSeasonZeroSelectionStatus;
  const genderInput = value(formData, "gender");

  const playerProfile: PlayerProfile | undefined =
    participantType === ApplicationType.PLAYER
      ? {
          gender: Object.values(AthleteGender).includes(genderInput as AthleteGender) ? (genderInput as AthleteGender) : undefined,
          dateOfBirth: value(formData, "dateOfBirth") || undefined,
          dominantHand: value(formData, "dominantHand") || undefined,
          position: value(formData, "position") || undefined,
          heightCm: value(formData, "heightCm") ? Number(value(formData, "heightCm")) : undefined,
          weightKg: value(formData, "weightKg") ? Number(value(formData, "weightKg")) : undefined,
        }
      : undefined;

  const result = await createAdminOfflineIntake({
    coachSeasonZeroDivision: Object.values(CoachSeasonZeroDivision).includes(divisionInput as CoachSeasonZeroDivision)
      ? (divisionInput as CoachSeasonZeroDivision)
      : undefined,
    coachSeasonZeroSelectionStatus: Object.values(CoachSeasonZeroSelectionStatus).includes(selectionInput) ? selectionInput : undefined,
    createdById: session.user.id,
    email: value(formData, "email") || undefined,
    fullName,
    notes: value(formData, "notes") || undefined,
    participantType,
    phone: value(formData, "phone") || undefined,
    playerProfile,
    reason: value(formData, "reason") || undefined,
    seasonId: value(formData, "seasonId") || undefined,
  });

  if (!result.created) {
    return {
      duplicateMatches: result.matches.map((match) => ({ ...match })),
      error: "A matching identity already exists. Reconcile it manually instead of creating a duplicate.",
    };
  }

  revalidatePath("/participants/offline-intake");
  return { createdId: result.intake.id };
}

export async function provisionOfflineIntakeAction(intakeId: string) {
  const session = await requirePermission("staff:manage");
  await provisionAdminOfflineIntake(intakeId, session.user.id);
  revalidatePath("/participants/offline-intake");
  revalidatePath("/coaches/assignments");
}

export async function updateOfflineIntakeContactAction(intakeId: string, formData: FormData) {
  const session = await requirePermission("staff:manage");
  await updateAdminOfflineIntakeContact(intakeId, { email: value(formData, "email") || undefined, phone: value(formData, "phone") || undefined }, session.user.id);
  revalidatePath("/participants/offline-intake");
}

export async function updateOfflineIntakePlayerProfileAction(intakeId: string, formData: FormData) {
  const session = await requirePermission("staff:manage");
  const genderInput = value(formData, "gender");
  await updateAdminOfflineIntakePlayerProfile(
    intakeId,
    {
      gender: Object.values(AthleteGender).includes(genderInput as AthleteGender) ? (genderInput as AthleteGender) : undefined,
      dateOfBirth: value(formData, "dateOfBirth") || undefined,
      dominantHand: value(formData, "dominantHand") || undefined,
      position: value(formData, "position") || undefined,
      heightCm: value(formData, "heightCm") ? Number(value(formData, "heightCm")) : undefined,
      weightKg: value(formData, "weightKg") ? Number(value(formData, "weightKg")) : undefined,
    },
    session.user.id,
  );
  revalidatePath("/participants/offline-intake");
}

export async function provisionPlayerOfflineIntakeAction(intakeId: string, formData: FormData) {
  const session = await requirePermission("staff:manage");
  const seasonId = value(formData, "seasonId");
  if (!seasonId) throw new Error("A season must be selected to provision a player.");
  await provisionPlayerOfflineIntake(intakeId, seasonId, session.user.id);
  revalidatePath("/participants/offline-intake");
  revalidatePath("/players");
  revalidatePath("/drafts");
}
