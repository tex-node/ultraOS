import { ImportType } from "@/generated/prisma/enums";
import { ImportUploadPage } from "@/app/imports/import-upload-page";

export default function PlayerImportPage() {
  return (
    <ImportUploadPage
      description="Import real tryout applicants into Athlete and Player season registrations, including Main Draft and Secondary Draft pool assignment."
      title="Import players"
      type={ImportType.PLAYER}
    />
  );
}
