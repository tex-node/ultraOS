"use server";

import { revalidatePath } from "next/cache";
import { RegistrationSubmissionStatus } from "@/generated/prisma/enums";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { updateRegistrationStatus } from "@/lib/registration/service";

// Uses the existing authorized event-management permission - deliberately does
// not introduce event:registration:manage.
export async function updateRegistrationStatusAction(id: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const status = String(formData.get("status") ?? "") as RegistrationSubmissionStatus;
  if (!Object.values(RegistrationSubmissionStatus).includes(status)) throw new Error("Invalid registration status.");
  await updateRegistrationStatus(organizationId, id, status, session.user.id, String(formData.get("reviewNotes") ?? ""));
  revalidatePath("/registrations");
  revalidatePath(`/registrations/${id}`);
}
