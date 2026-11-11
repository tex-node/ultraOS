"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";
import { loadPlanUsage, type PlanName } from "@/lib/plans";

// Manual plan override (streak v17, Prompt 3).
//
// SUPER_ADMIN only, and deliberately narrow: it changes ONE column on ONE organization. There is no "grant everything"
// switch, because the failure mode of an admin tool is doing more than the human meant. Every change is written to the
// audit log against the admin who made it, which is the one place a synthetic actor would be a lie.
export async function setOrganizationPlanAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Not signed in.");
  if (!session.user.roles.includes("SUPER_ADMIN")) throw new Error("Only a platform administrator can change an organization's plan.");

  const organizationId = String(formData.get("organizationId") ?? "");
  const plan = String(formData.get("plan") ?? "");
  if (!["FREE", "PRO", "ENTERPRISE"].includes(plan)) throw new Error(`Unknown plan ${plan}.`);
  if (!organizationId) throw new Error("No organization supplied.");

  const before = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true, name: true } });
  await prisma.organization.update({ where: { id: organizationId }, data: { plan: plan as PlanName } });

  // AuditLog.userId is a real foreign key, and here there IS a real user: the admin clicking the dropdown.
  await withOrganizationContext(organizationId, (tx) =>
    tx.auditLog.create({
      data: {
        organizationId,
        userId: session.user.id,
        action: "BILLING_PLAN_CHANGED_BY_ADMIN",
        entityType: "Organization",
        entityId: organizationId,
        details: { from: before.plan, to: plan, organizationName: before.name },
      },
    }),
  );

  revalidatePath("/admin/organizations");
  revalidatePath("/settings/billing");
}

/** Usage for the table: one query per organization, on a page only a platform admin can open. */
export async function loadOrganizationsWithUsage() {
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, plan: true, createdAt: true, _count: { select: { competitions: true } } },
  });
  return Promise.all(
    organizations.map(async (organization) => ({
      ...organization,
      usage: await withOrganizationContext(organization.id, (tx) => loadPlanUsage(tx, organization.id)).catch(() => null),
    })),
  );
}
