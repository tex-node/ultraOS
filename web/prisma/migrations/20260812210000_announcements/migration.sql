-- Monthly celebrant announcements (currently birthdays only, scoped to Players)
-- and fan-submitted well wishes, moderated before public display.

CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');
CREATE TYPE "AnnouncementVisibility" AS ENUM ('PUBLIC', 'FAN_ZONE_MEMBERS', 'CLUB_FAN_ZONE');
CREATE TYPE "WellWishStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "Announcement" (
    "id"               TEXT NOT NULL,
    "playerId"         TEXT NOT NULL,
    "celebrationYear"  INTEGER NOT NULL,
    "status"           "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility"       "AnnouncementVisibility" NOT NULL DEFAULT 'PUBLIC',
    "visibilityClubId" TEXT,
    "message"          TEXT,
    "publishedAt"      TIMESTAMP(3),
    "createdById"      TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Announcement_playerId_celebrationYear_key" ON "Announcement"("playerId", "celebrationYear");
CREATE INDEX "Announcement_status_celebrationYear_idx" ON "Announcement"("status", "celebrationYear");
CREATE INDEX "Announcement_visibilityClubId_idx" ON "Announcement"("visibilityClubId");

CREATE TABLE "WellWish" (
    "id"             TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "authorUserId"   TEXT,
    "authorName"     TEXT NOT NULL,
    "message"        TEXT NOT NULL,
    "status"         "WellWishStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedById"  TEXT,
    "moderatedAt"    TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellWish_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WellWish_announcementId_status_idx" ON "WellWish"("announcementId", "status");

ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_visibilityClubId_fkey" FOREIGN KEY ("visibilityClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WellWish" ADD CONSTRAINT "WellWish_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WellWish" ADD CONSTRAINT "WellWish_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WellWish" ADD CONSTRAINT "WellWish_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
