"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { canViewAnnouncement, getViewerClubMemberships } from "@/lib/announcements";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

const wellWishSchema = z.object({
  authorName: z.string().trim().min(2).max(60),
  message: z.string().trim().min(2).max(500),
});

export async function submitWellWish(announcementId: string, formData: FormData) {
  const session = await auth();
  const input = wellWishSchema.parse(Object.fromEntries(formData.entries()));

  const organization = await resolveDefaultPublicOrganization();

  await withOrganizationContext(organization.id, async (tx) => {
    const announcement = await tx.announcement.findUniqueOrThrow({ where: { id: announcementId } });
    if (announcement.status !== "PUBLISHED") {
      throw new Error("This announcement is not currently public.");
    }
    const viewerClubIds = await getViewerClubMemberships(session?.user?.id, tx);
    if (!canViewAnnouncement(announcement.visibility, announcement.visibilityClubId, viewerClubIds)) {
      throw new Error("You don't have access to this announcement.");
    }

    await tx.wellWish.create({
      data: {
        organizationId: organization.id,
        announcementId,
        authorUserId: session?.user?.id ?? null,
        authorName: input.authorName,
        message: input.message,
      },
    });
  });
  revalidatePath("/public/celebrations");
}
