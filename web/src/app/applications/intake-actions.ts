"use server";

import { revalidatePath } from "next/cache";
import { ApplicationType } from "@/generated/prisma/enums";
import { setApplicationTypeClosed } from "@/lib/application-intake";
import { requirePermission } from "@/lib/authorization";

export async function toggleApplicationIntakeAction(type: ApplicationType, closed: boolean, formData: FormData) {
  const session = await requirePermission("application:review");
  const reason = formData.get("reason");
  await setApplicationTypeClosed(type, closed, session.user.id, typeof reason === "string" && reason.trim() ? reason.trim() : undefined);
  revalidatePath("/applications");
  revalidatePath("/apply");
  revalidatePath(`/apply/${type.toLowerCase()}`);
}
