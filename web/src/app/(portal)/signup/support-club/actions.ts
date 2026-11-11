"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { writeAuditLog } from "@/lib/audit";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

// Phase 1 Stage 5.5B: matches support-club/page.tsx's Pattern D reasoning - session.user.organizationId
// is null for a self-registered fan (see the page's doc comment), so this write resolves the same
// default public organization rather than trusting an absent/null session org.
export async function chooseSupportedClub(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const chosenFanClubId = formData.get("fanClubId");
  if (typeof chosenFanClubId !== "string" || !chosenFanClubId) return;

  const organization = await resolveDefaultPublicOrganization();
  await withOrganizationContext(organization.id, async (tx) => {
    const membership = await tx.fanMembership.upsert({
      create: { fanClubId: chosenFanClubId, name: session.user.name, source: "signup", userId: session.user.id },
      update: {},
      where: { userId_fanClubId: { fanClubId: chosenFanClubId, userId: session.user.id } },
    });
    await writeAuditLog(tx, {
      organizationId: organization.id,
      action: "FAN_CLUB_SUPPORT_CHOSEN",
      details: { fanClubId: chosenFanClubId, source: "signup" },
      entityId: membership.id,
      entityType: "FanMembership",
      userId: session.user.id,
    });
  });

  const callbackUrl = formData.get("callbackUrl");
  redirect(typeof callbackUrl === "string" && callbackUrl ? callbackUrl : "/public/events");
}

export async function skipSupportedClub(formData: FormData) {
  const callbackUrl = formData.get("callbackUrl");
  redirect(typeof callbackUrl === "string" && callbackUrl ? callbackUrl : "/public/events");
}
