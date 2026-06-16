CREATE TYPE "ApplicationType" AS ENUM ('PLAYER', 'COACH', 'SCOUT', 'OFFICIAL', 'MEDIA', 'VENDOR', 'VOLUNTEER');

CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "applicantUserId" TEXT,
    "type" "ApplicationType" NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedData" JSONB NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Application_type_status_createdAt_idx" ON "Application"("type", "status", "createdAt");
CREATE INDEX "Application_applicantUserId_createdAt_idx" ON "Application"("applicantUserId", "createdAt");
CREATE INDEX "Application_reviewedById_reviewedAt_idx" ON "Application"("reviewedById", "reviewedAt");

ALTER TABLE "Application" ADD CONSTRAINT "Application_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
