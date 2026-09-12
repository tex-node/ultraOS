"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  MediaAssetPurpose,
  MediaVisibility,
} from "@/generated/prisma/enums";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import {
  approveMediaAsset,
  archiveMediaAsset,
  assignPrimaryMediaAsset,
  uploadMediaAsset,
  type MediaAssignmentTarget,
} from "@/lib/media-storage";
import { withOrganizationContext } from "@/lib/tenant-context";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function enumValue<T extends Record<string, string>>(source: T, value: string, fallback: T[keyof T]) {
  return Object.values(source).includes(value) ? (value as T[keyof T]) : fallback;
}

export async function uploadMedia(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("media:upload");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("A media file is required.");
  const purpose = enumValue(MediaAssetPurpose, text(formData, "purpose"), MediaAssetPurpose.CONTENT_ASSET);
  const visibility = enumValue(MediaVisibility, text(formData, "visibility"), MediaVisibility.PRIVATE);
  const asset = await withOrganizationContext(organizationId, (tx) =>
    uploadMediaAsset({
      tx,
      organizationId,
      altText: text(formData, "altText") || undefined,
      caption: text(formData, "caption") || undefined,
      file,
      purpose,
      title: text(formData, "title") || undefined,
      uploadedById: session.user.id,
      visibility,
    }),
  );
  revalidatePath("/media");
  redirect(`/media/${asset.id}`);
}

export async function assignPrimaryAsset(assetId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("media:manage");
  const entityType = text(formData, "entityType") as MediaAssignmentTarget["entityType"];
  const entityId = text(formData, "entityId");
  const purpose = enumValue(MediaAssetPurpose, text(formData, "purpose"), MediaAssetPurpose.CONTENT_ASSET);
  if (!["Club", "Athlete", "Staff"].includes(entityType) || !entityId) throw new Error("A valid assignment target is required.");
  await withOrganizationContext(organizationId, (tx) =>
    assignPrimaryMediaAsset(tx, organizationId, { entityId, entityType, purpose }, assetId, session.user.id),
  );
  revalidatePath("/media");
  revalidatePath(`/media/${assetId}`);
}

export async function approveAsset(assetId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("media:approve");
  await withOrganizationContext(organizationId, (tx) => approveMediaAsset(tx, organizationId, assetId, session.user.id));
  revalidatePath("/media");
  revalidatePath(`/media/${assetId}`);
}

export async function archiveAsset(assetId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("media:manage");
  await withOrganizationContext(organizationId, (tx) => archiveMediaAsset(tx, organizationId, assetId, session.user.id));
  revalidatePath("/media");
  revalidatePath(`/media/${assetId}`);
}

async function uploadAndAssignPrimary(params: {
  entityId: string;
  entityType: MediaAssignmentTarget["entityType"];
  purpose: MediaAssetPurpose;
  revalidatePaths: string[];
  formData: FormData;
}) {
  const { session, organizationId } = await requirePermissionWithOrganization("media:upload");
  const file = params.formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("A media file is required.");
  await withOrganizationContext(organizationId, async (tx) => {
    const asset = await uploadMediaAsset({
      tx,
      organizationId,
      altText: text(params.formData, "altText") || undefined,
      caption: text(params.formData, "caption") || undefined,
      file,
      purpose: params.purpose,
      title: text(params.formData, "title") || undefined,
      uploadedById: session.user.id,
      visibility: MediaVisibility.PUBLIC,
    });
    await assignPrimaryMediaAsset(tx, organizationId, { entityId: params.entityId, entityType: params.entityType, purpose: params.purpose }, asset.id, session.user.id);
  });
  revalidatePath("/media");
  for (const path of params.revalidatePaths) revalidatePath(path);
}

export async function uploadClubLogo(clubId: string, formData: FormData) {
  await uploadAndAssignPrimary({
    entityId: clubId,
    entityType: "Club",
    formData,
    purpose: MediaAssetPurpose.CLUB_LOGO,
    revalidatePaths: ["/clubs", `/clubs/${clubId}`],
  });
}

export async function uploadAthleteProfilePhoto(athleteId: string, formData: FormData) {
  await uploadAndAssignPrimary({
    entityId: athleteId,
    entityType: "Athlete",
    formData,
    purpose: MediaAssetPurpose.PLAYER_PROFILE_PHOTO,
    revalidatePaths: ["/players", `/players/${athleteId}`],
  });
}

export async function uploadStaffProfilePhoto(staffId: string, formData: FormData) {
  await uploadAndAssignPrimary({
    entityId: staffId,
    entityType: "Staff",
    formData,
    purpose: MediaAssetPurpose.COACH_PROFILE_PHOTO,
    revalidatePaths: ["/staff", `/staff/${staffId}`, `/coaches/${staffId}`],
  });
}
