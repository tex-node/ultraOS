"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import {
  sportOverrideSchema,
  validateSportOverride,
  type SportOverrideConfig,
} from "@/lib/sports/overrides";
import { requireSportDefinition } from "@/lib/sports/registry";
import { withOrganizationContext } from "@/lib/tenant-context";

export type SportRulesFormState = { error?: string; saved?: boolean };

async function loadSportSlug(organizationId: string, sportId: string): Promise<string> {
  return withOrganizationContext(organizationId, async (tx) => {
    const sport = await tx.sport.findUnique({ where: { id: sportId }, select: { slug: true } });
    if (!sport) throw new Error("Sport not found.");
    return sport.slug;
  });
}

export async function saveSportOverride(
  _previous: SportRulesFormState,
  formData: FormData,
): Promise<SportRulesFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("competition:manage");
  const sportId = String(formData.get("sportId") ?? "");
  const competitionId = String(formData.get("competitionId") ?? "");
  if (!sportId) return { error: "Missing sport." };

  const definition = requireSportDefinition(await loadSportSlug(organizationId, sportId));

  const rules: Record<string, number | string | boolean> = {};
  for (const rule of definition.rules ?? []) {
    const raw = formData.get(`rule:${rule.key}`);
    if (raw === null) continue;
    if (typeof rule.value === "number") {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) return { error: `${rule.label ?? rule.key} must be a number.` };
      rules[rule.key] = parsed;
    } else if (typeof rule.value === "boolean") {
      rules[rule.key] = raw === "true";
    } else {
      rules[rule.key] = String(raw);
    }
  }

  const divisionNames = [
    ...new Set(String(formData.get("defaultDivisions") ?? "").split(",").map((name) => name.trim()).filter(Boolean)),
  ];

  const candidate: SportOverrideConfig = { rules, ...(divisionNames.length ? { defaultDivisions: divisionNames } : {}) };
  const parsed = sportOverrideSchema.safeParse(candidate);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the values." };
  }
  const issues = validateSportOverride(definition, parsed.data);
  if (issues.length > 0) return { error: issues[0] };

  await withOrganizationContext(organizationId, async (tx) => {
    const latest = await tx.sportDefinitionOverride.findFirst({
      where: { organizationId, sportId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    await tx.sportDefinitionOverride.updateMany({
      where: { organizationId, sportId, isActive: true },
      data: { isActive: false },
    });
    const override = await tx.sportDefinitionOverride.create({
      data: { organizationId, sportId, version, config: parsed.data, isActive: true },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "SPORT_DEFINITION_OVERRIDE_SAVED",
      entityType: "SportDefinitionOverride",
      entityId: override.id,
      details: { sport: definition.key, version, rules: parsed.data.rules ?? {}, defaultDivisions: divisionNames },
    });
  });

  revalidatePath(`/competitions/${competitionId}`);
  revalidatePath(`/competitions/${competitionId}/sport-rules`);
  return { saved: true };
}

export async function clearSportOverride(
  _previous: SportRulesFormState,
  formData: FormData,
): Promise<SportRulesFormState> {
  const { session, organizationId } = await requirePermissionWithOrganization("competition:manage");
  const sportId = String(formData.get("sportId") ?? "");
  const competitionId = String(formData.get("competitionId") ?? "");
  if (!sportId) return { error: "Missing sport." };

  await withOrganizationContext(organizationId, async (tx) => {
    const cleared = await tx.sportDefinitionOverride.updateMany({
      where: { organizationId, sportId, isActive: true },
      data: { isActive: false },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "SPORT_DEFINITION_OVERRIDE_CLEARED",
      entityType: "SportDefinitionOverride",
      entityId: sportId,
      details: { cleared: cleared.count },
    });
  });

  revalidatePath(`/competitions/${competitionId}`);
  revalidatePath(`/competitions/${competitionId}/sport-rules`);
  return { saved: true };
}
