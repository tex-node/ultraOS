"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { createLeague } from "@/server/onboarding/create-league";

// The wizard's single submit (streak v15, Prompt 3).
//
// Everything the five steps gathered arrives here and is written in ONE transaction: organization (new or existing),
// competition, division, season, participants and the fixture list. A failure anywhere rolls the whole league back,
// which is the point - a half-created league with fixtures pointing at missing clubs is worse than a clear error.
const setupInput = z.object({
  sportSlug: z.string().min(1),
  competitionName: z.string().min(3).max(120),
  newOrganizationName: z.string().trim().max(120).optional(),
  newOrganizationSlug: z.string().trim().max(80).optional(),
  participants: z.array(z.string().trim().min(1).max(80)).min(2).max(64),
  format: z.enum(["ROUND_ROBIN", "KNOCKOUT"]),
  gamesPerPairing: z.coerce.number().int().min(1).max(2).default(1),
  startDate: z.string().min(8),
});

export type SetupWizardResult =
  | { ok: true; slug: string; organizationSlug: string; competitionId: string; participants: number; fixtures: number; kind: "team" | "individual" }
  | { ok: false; error: string };

export async function createLeagueAction(_previous: SetupWizardResult | null, formData: FormData): Promise<SetupWizardResult> {
  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  const raw = {
    sportSlug: String(formData.get("sportSlug") ?? ""),
    competitionName: String(formData.get("competitionName") ?? ""),
    newOrganizationName: String(formData.get("newOrganizationName") ?? "") || undefined,
    newOrganizationSlug: String(formData.get("newOrganizationSlug") ?? "") || undefined,
    participants: String(formData.get("participants") ?? "").split(/\r?\n|,/).map((name) => name.trim()).filter(Boolean),
    format: String(formData.get("format") ?? "ROUND_ROBIN"),
    gamesPerPairing: String(formData.get("gamesPerPairing") ?? "1"),
    startDate: String(formData.get("startDate") ?? new Date().toISOString().slice(0, 10)),
  };
  const parsed = setupInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
  const input = parsed.data;

  // A brand-new organization is created inside the transaction, so it needs to be written with the platform role; the
  // caller's own organization is used otherwise (the common case: a partner adding a competition to the league they
  // already have).
  const wantsNewOrganization = Boolean(input.newOrganizationName && input.newOrganizationSlug);
  if (wantsNewOrganization && !session.user.roles.includes("SUPER_ADMIN")) {
    return { ok: false, error: "Only a platform administrator can create a new organization; add the competition to your existing league instead." };
  }

  try {
    const result = await withOrganizationContext(
      organizationId,
      (tx) =>
        createLeague(tx, {
          organizationId: wantsNewOrganization ? null : organizationId,
          organizationName: input.newOrganizationName ?? "",
          organizationSlug: input.newOrganizationSlug ?? "",
          sportSlug: input.sportSlug,
          competitionName: input.competitionName,
          entrantNames: input.participants,
          format: input.format,
          gamesPerPairing: input.gamesPerPairing === 2 ? 2 : 1,
          startDate: new Date(`${input.startDate}T09:00:00.000Z`),
          matchDayOffsetDays: 7,
        }),
      // Creating a NEW organization crosses the tenant boundary by definition, so that one path uses the platform
      // client; the row it creates is then owned by the new organization and every later read is tenant-scoped.
      wantsNewOrganization ? prisma : undefined,
    );

    await withOrganizationContext(result.organizationId, (tx) =>
      writeAuditLog(tx, {
        organizationId: result.organizationId,
        userId: session.user.id,
        action: "LEAGUE_CREATED_VIA_WIZARD",
        entityType: "Competition",
        entityId: result.competitionId,
        details: { sport: input.sportSlug, format: input.format, participants: result.participants, fixtures: result.fixtures, kind: result.kind },
      }),
    );

    // The new public URL is /t/<organizationSlug>/<competitionSlug> (streak v16, Prompt 2).
    const organization = await prisma.organization.findUnique({ where: { id: result.organizationId }, select: { slug: true } });
    revalidatePath("/admin/setup-wizard");
    revalidatePath("/public");
    return { ok: true, ...result, organizationSlug: organization?.slug ?? "unknown" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
