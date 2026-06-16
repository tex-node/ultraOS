ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PLAYER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OFFICIAL';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'VENDOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MEDIA';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'VOLUNTEER';

ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'OFFICIAL';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'VOLUNTEER';

CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "equipment" TEXT,
    "socialLinks" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VolunteerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "areaOfInterest" TEXT NOT NULL,
    "availability" TEXT NOT NULL,
    "experience" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Athlete" ADD COLUMN "userId" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "UserRoleAssignment_userId_role_key" ON "UserRoleAssignment"("userId", "role");
CREATE INDEX "UserRoleAssignment_role_revokedAt_idx" ON "UserRoleAssignment"("role", "revokedAt");
CREATE INDEX "UserRoleAssignment_grantedById_grantedAt_idx" ON "UserRoleAssignment"("grantedById", "grantedAt");
CREATE UNIQUE INDEX "Athlete_userId_key" ON "Athlete"("userId");
CREATE UNIQUE INDEX "Vendor_userId_key" ON "Vendor"("userId");
CREATE UNIQUE INDEX "MediaProfile_userId_key" ON "MediaProfile"("userId");
CREATE UNIQUE INDEX "VolunteerProfile_userId_key" ON "VolunteerProfile"("userId");

ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaProfile" ADD CONSTRAINT "MediaProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerProfile" ADD CONSTRAINT "VolunteerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "UserRoleAssignment" ("id", "userId", "role", "grantedAt", "createdAt", "updatedAt")
SELECT concat('migrated-role-', "id", '-', "role"), "id", "role", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId", "role") DO NOTHING;

INSERT INTO "UserRoleAssignment" ("id", "userId", "role", "grantedAt", "createdAt", "updatedAt")
SELECT concat('migrated-role-', "id", '-FAN'), "id", 'FAN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId", "role") DO NOTHING;
