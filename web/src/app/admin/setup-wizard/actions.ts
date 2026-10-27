"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { createLeague } from "@/server/onboarding/create-league";
import { allocateOrganizationPrefixes } from "@/lib/organization-prefixes";

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
    // Creating a NEW organization cannot happen inside the CALLER's tenant context (streak v22, found by the onboarding
    // dry run): the organization row itself is not RLS-scoped, but everything createLeague writes next - Competition,
    // Division, Season, Club - is, and the policy checks the row's organizationId against app.current_org_id. With the
    // caller's context set, every insert for the new league was refused. So the organization is created first (it needs
    // no context), and the league is built INSIDE the new organization's own context.
    let targetOrganizationId = organizationId;
    if (wantsNewOrganization) {
      const existing = await prisma.organization.findUnique({ where: { slug: input.newOrganizationSlug! }, select: { id: true } });
      const created = existing
        ? existing
        : await prisma.organization.create({
            data: {
              name: input.newOrganizationName!,
              slug: input.newOrganizationSlug!,
              plan: "FREE",
              ...(await allocateOrganizationPrefixes(prisma, input.newOrganizationSlug!)),
            },
            select: { id: true },
          });
      targetOrganizationId = created.id;
    }

    const result = await withOrganizationContext(targetOrganizationId, (tx) =>
      createLeague(tx, {
        organizationId: targetOrganizationId,
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
