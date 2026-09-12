import { MediaAssetPurpose, MediaVisibility } from "@/generated/prisma/enums";
import { uploadMediaAsset } from "@/lib/media-storage";
import { withOrganizationContext } from "@/lib/tenant-context";

export type UploadedFile = {
  key: string;
  url: string | null;
  contentType: string;
  size: number;
};

// Phase 1 Stage 5.2B-1: organizationId is now the caller's responsibility - resolved from the
// trusted /apply/[organizationSlug] route via resolveActiveOrganizationBySlug(), never guessed
// or hardcoded here. This function makes no assumption about which organization it's uploading
// into.
export async function uploadProfilePhoto(file: File, userId: string, organizationId: string) {
  const asset = await withOrganizationContext(organizationId, (tx) =>
    uploadMediaAsset({
      tx,
      organizationId,
      file,
      purpose: MediaAssetPurpose.PLAYER_PROFILE_PHOTO,
      uploadedById: userId,
      visibility: MediaVisibility.PUBLIC,
    }),
  );
  return {
    key: asset.objectKey,
    url: asset.publicUrl ?? `/media/assets/${asset.id}/file`,
    contentType: asset.mimeType,
    size: asset.byteSize,
  } satisfies UploadedFile;
}
