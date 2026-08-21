import { MediaAssetPurpose, MediaVisibility } from "@/generated/prisma/enums";
import { uploadMediaAsset } from "@/lib/media-storage";

export type UploadedFile = {
  key: string;
  url: string | null;
  contentType: string;
  size: number;
};

export async function uploadProfilePhoto(file: File, userId: string) {
  const asset = await uploadMediaAsset({
    file,
    purpose: MediaAssetPurpose.PLAYER_PROFILE_PHOTO,
    uploadedById: userId,
    visibility: MediaVisibility.PUBLIC,
  });
  return {
    key: asset.objectKey,
    url: asset.publicUrl ?? `/media/assets/${asset.id}/file`,
    contentType: asset.mimeType,
    size: asset.byteSize,
  } satisfies UploadedFile;
}
