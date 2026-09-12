"use server";

import { revalidatePath } from "next/cache";
import { RegistrationFormStatus } from "@/generated/prisma/enums";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { parseSportConfigForm } from "@/lib/registration/sport-config-admin";
import { upsertEventRegistrationConfig } from "@/lib/registration/service";

export type SportConfigFormState = { error?: string; success?: string };

// Admin-only. Only `event:manage` may reach this. The client-submitted payload is
// re-parsed and cross-validated server-side before write; it can only ever
// affect the bound eventId within the caller's organization.
export async function saveSportConfigAction(eventId: string, _state: SportConfigFormState, formData: FormData): Promise<SportConfigFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Invalid configuration." };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: "Invalid configuration." };
  }

  let config;
  try {
    config = parseSportConfigForm(parsed.config);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid sport configuration." };
  }

  const status = String(parsed.status ?? "") as RegistrationFormStatus;
  if (!Object.values(RegistrationFormStatus).includes(status)) return { error: "Invalid form status." };

  const capacityRaw = parsed.capacity;
  const capacity = capacityRaw === "" || capacityRaw === null || capacityRaw === undefined ? null : Number(capacityRaw);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) return { error: "Capacity must be a non-negative whole number." };

  const toDate = (value: unknown): Date | null => (typeof value === "string" && value ? new Date(value) : null);
  const opensAt = toDate(parsed.opensAt);
  const closesAt = toDate(parsed.closesAt);
  if (opensAt && closesAt && opensAt > closesAt) return { error: "Closing date must be after the opening date." };

  const form = await upsertEventRegistrationConfig(organizationId, eventId, {
    title: String(parsed.title ?? ""),
    description: parsed.description ? String(parsed.description) : null,
    status,
    publicEnabled: Boolean(parsed.publicEnabled),
    opensAt,
    closesAt,
    capacity,
    config,
  }, session.user.id);

  if (!form) return { error: "Event not found." };
  revalidatePath(`/events/${eventId}/registration`);
  return { success: "Sport configuration saved." };
}
