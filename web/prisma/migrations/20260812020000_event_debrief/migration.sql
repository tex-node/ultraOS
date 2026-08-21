-- Post-event retrospective data: actual attendance, vendor/volunteer performance,
-- and free-text learnings for refining the next edition. Separate from the pre-event
-- Runbook (checklists) and live-ops Incident models.

CREATE TABLE "EventDebrief" (
    "id"                TEXT NOT NULL,
    "eventId"           TEXT NOT NULL,
    "actualAttendance"  INTEGER,
    "weatherConditions" TEXT,
    "whatWentWell"      TEXT,
    "whatToImprove"     TEXT,
    "generalNotes"      TEXT,
    "createdById"       TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDebrief_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventDebrief_eventId_key" ON "EventDebrief"("eventId");

CREATE TABLE "EventVendorReview" (
    "id"              TEXT NOT NULL,
    "eventId"         TEXT NOT NULL,
    "vendorId"        TEXT NOT NULL,
    "rating"          INTEGER,
    "wouldInviteBack" BOOLEAN,
    "notes"           TEXT,
    "createdById"     TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventVendorReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventVendorReview_eventId_vendorId_key" ON "EventVendorReview"("eventId", "vendorId");

CREATE TABLE "EventVolunteerReview" (
    "id"              TEXT NOT NULL,
    "eventId"         TEXT NOT NULL,
    "volunteerId"     TEXT NOT NULL,
    "roleDescription" TEXT,
    "rating"          INTEGER,
    "notes"           TEXT,
    "createdById"     TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventVolunteerReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventVolunteerReview_eventId_volunteerId_key" ON "EventVolunteerReview"("eventId", "volunteerId");

ALTER TABLE "EventDebrief" ADD CONSTRAINT "EventDebrief_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventDebrief" ADD CONSTRAINT "EventDebrief_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventVendorReview" ADD CONSTRAINT "EventVendorReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventVendorReview" ADD CONSTRAINT "EventVendorReview_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventVendorReview" ADD CONSTRAINT "EventVendorReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventVolunteerReview" ADD CONSTRAINT "EventVolunteerReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventVolunteerReview" ADD CONSTRAINT "EventVolunteerReview_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventVolunteerReview" ADD CONSTRAINT "EventVolunteerReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
