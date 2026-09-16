"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { isCompetitionFormat, normalizeGroupCount, type CompetitionFormatValue } from "@/lib/sports/format";
import { withOrganizationContext } from "@/lib/tenant-context";

export type FormatFormState = { error?: string; ok?: boolean };

const competitionSchema = z.object({
  competitionId: z.string().min(1),
  format: z.string().min(1),
  groupCount: z.string().optional(),
});

// Format is editable, but it only affects fixtures generated afterwards. Changing it does not
// re-shape an existing schedule, so the UI warns and the audit log records the transition.
export async function updateCompetitionFormat(
  _previous: FormatFormState,
  formData: FormData,
): Promise<FormatFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("competition:manage");
  const parsed = competitionSchema.safeParse(formDataToRecord(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const input = parsed.data;
  if (!isCompetitionFormat(input.format)) return { error: "Unknown format." };

  const groupCount = normalizeGroupCount(input.groupCount ? Number(input.groupCount) : null);

  await withOrganizationContext(organizationId, async (tx) => {
    const competition = await tx.competition.findFirstOrThrow({
      where: { id: input.competitionId, organizationId },
      select: { id: true, format: true, groupCount: true },
    });
    await tx.competition.update({
      where: { id: competition.id },
      data: { format: input.format as CompetitionFormatValue, groupCount },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "COMPETITION_FORMAT_UPDATED",
      entityType: "Competition",
      entityId: competition.id,
      details: { from: competition.format, to: input.format, groupCount },
    });
  });

  revalidatePath(`/competitions/${input.competitionId}`);
  revalidatePath(`/competitions/${input.competitionId}/settings`);
  return { ok: true };
}

const divisionSchema = z.object({
  competitionId: z.string().min(1),
  divisionId: z.string().min(1),
  format: z.string().optional(),
  groupCount: z.string().optional(),
});

// Per-division override. "INHERIT" (or an empty group count) clears the override so the division
// follows the competition again.
export async function updateDivisionFormat(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("competition:manage");
  const parsed = divisionSchema.safeParse(formDataToRecord(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Please check the form.");
  const input = parsed.data;

  const format: CompetitionFormatValue | null =
    input.format && input.format !== "INHERIT" && isCompetitionFormat(input.format) ? input.format : null;

  const rawGroup = input.groupCount?.trim();
  if (rawGroup && !Number.isFinite(Number(rawGroup))) throw new Error("Group count must be a number.");
  const groupCount = rawGroup ? normalizeGroupCount(Number(rawGroup)) : null;

  await withOrganizationContext(organizationId, async (tx) => {
    const division = await tx.division.findFirstOrThrow({
      where: { id: input.divisionId, competitionId: input.competitionId, organizationId },
      select: { id: true, name: true, format: true, groupCount: true },
    });
    await tx.division.update({ where: { id: division.id }, data: { format, groupCount } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "DIVISION_FORMAT_UPDATED",
      entityType: "Division",
      entityId: division.id,
      details: { from: division.format, to: format, groupCount },
    });
  });

  revalidatePath(`/competitions/${input.competitionId}`);
  revalidatePath(`/competitions/${input.competitionId}/settings`);
}
