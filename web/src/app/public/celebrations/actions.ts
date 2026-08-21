"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { canViewAnnouncement, getViewerClubMemberships } from "@/lib/announcements";
import { prisma } from "@/lib/prisma";

const wellWishSchema = z.object({
  authorName: z.string().trim().min(2).max(60),
  message: z.string().trim().min(2).max(500),
});

export async function submitWellWish(announcementId: string, formData: FormData) {
  const session = await auth();
  const input = wellWishSchema.parse(Object.fromEntries(formData.entries()));

  const announcement = await prisma.announcement.findUniqueOrThrow({ where: { id: announcementId } });
  if (announcement.status !== "PUBLISHED") {
    throw new Error("This announcement is not currently public.");
  }
  const viewerClubIds = await getViewerClubMemberships(session?.user?.id);
  if (!canViewAnnouncement(announcement.visibility, announcement.visibilityClubId, viewerClubIds)) {
    throw new Error("You don't have access to this announcement.");
  }

  await prisma.wellWish.create({
    data: {
      announcementId,
      authorUserId: session?.user?.id ?? null,
      authorName: input.authorName,
      message: input.message,
    },
  });
  revalidatePath("/public/celebrations");
}
