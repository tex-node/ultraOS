-- New status enum for offline-intake records.
CREATE TYPE "AdminOfflineIntakeStatus" AS ENUM ('DRAFT', 'READY_FOR_PROVISIONING', 'PROVISIONED');

-- Admin Offline Intake: participants recruited/onboarded outside the public
-- Application workflow. Never backfilled with a fabricated Application.
CREATE TABLE "AdminOfflineIntake" (
    "id" TEXT NOT NULL,
    "participantType" "ApplicationType" NOT NULL,
    "status" "AdminOfflineIntakeStatus" NOT NULL DEFAULT 'DRAFT',
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "seasonId" TEXT,
    "notes" TEXT,
    "coachSeasonZeroSelectionStatus" "CoachSeasonZeroSelectionStatus" NOT NULL DEFAULT 'PENDING',
    "coachSeasonZeroDivision" "CoachSeasonZeroDivision",
    "provisionedUserId" TEXT,
    "provisionedStaffId" TEXT,
    "provisionedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "reason" TEXT,
    "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'ADMIN_OFFLINE_INTAKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminOfflineIntake_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminOfflineIntake_participantType_status_createdAt_idx" ON "AdminOfflineIntake"("participantType", "status", "createdAt");
CREATE INDEX "AdminOfflineIntake_email_idx" ON "AdminOfflineIntake"("email");
CREATE INDEX "AdminOfflineIntake_phone_idx" ON "AdminOfflineIntake"("phone");

ALTER TABLE "AdminOfflineIntake" ADD CONSTRAINT "AdminOfflineIntake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
