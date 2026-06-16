import { ApplicationType } from "@/generated/prisma/enums";

export const applicationReviewRoutes = [
  { href: "/applications/players", label: "Players", type: ApplicationType.PLAYER },
  { href: "/applications/coaches", label: "Coaches", type: ApplicationType.COACH },
  { href: "/applications/scouts", label: "Scouts", type: ApplicationType.SCOUT },
  { href: "/applications/officials", label: "Officials", type: ApplicationType.OFFICIAL },
  { href: "/applications/vendors", label: "Vendors", type: ApplicationType.VENDOR },
  { href: "/applications/media", label: "Media", type: ApplicationType.MEDIA },
  { href: "/applications/volunteers", label: "Volunteers", type: ApplicationType.VOLUNTEER },
];

export const applicationCategoryToType: Record<string, ApplicationType> = {
  players: ApplicationType.PLAYER,
  coaches: ApplicationType.COACH,
  scouts: ApplicationType.SCOUT,
  officials: ApplicationType.OFFICIAL,
  vendors: ApplicationType.VENDOR,
  media: ApplicationType.MEDIA,
  volunteers: ApplicationType.VOLUNTEER,
};
