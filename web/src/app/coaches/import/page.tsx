import { ImportType } from "@/generated/prisma/enums";
import { ImportUploadPage } from "@/app/imports/import-upload-page";

export default function CoachImportPage() {
  return (
    <ImportUploadPage
      description="Import coach applications and Staff profiles. Optional team assignments write to SeasonClub only after confirmation."
      title="Import coaches"
      type={ImportType.COACH}
    />
  );
}
