"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setCheckInStatus } from "@/lib/game-day-checkin";
import { requireAnyPermission } from "@/lib/authorization";

const schema = z.object({
  eventId: z.string().min(1),
  playerId: z.string().min(1),
  status: z.enum(["PRESENT", "LATE", "ABSENT", "UNAVAILABLE"]),
});

export async function setCheckInStatusAction(formData: FormData) {
  const session = await requireAnyPermission(["game:operate", "check-in:operate"]);
  const input = schema.parse(Object.fromEntries(formData.entries()));
  await setCheckInStatus(input.eventId, input.playerId, input.status, session.user.id);
  revalidatePath("/gameday/checkin");
  revalidatePath("/gameday");
}
