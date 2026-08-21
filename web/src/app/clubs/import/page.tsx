import { ImportType } from "@/generated/prisma/enums";
import { ImportUploadPage } from "@/app/imports/import-upload-page";

export default function ClubImportPage() {
  return (
    <ImportUploadPage
      description="Import permanent Club identities and optional SeasonClub registrations. Competitive records are not overwritten."
      title="Import clubs"
      type={ImportType.CLUB}
    />
  );
}
