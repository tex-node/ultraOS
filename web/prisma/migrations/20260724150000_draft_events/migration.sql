CREATE TYPE "DraftEventStatus" AS ENUM ('DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "DraftEventStage" AS ENUM ('INTRO', 'CLUB_REVEAL', 'MEN_COACH_ALLOCATION', 'WOMEN_COACH_ALLOCATION', 'MEN_SQUAD_ALLOCATION', 'WOMEN_SQUAD_ALLOCATION', 'TEAM_INTRODUCTIONS', 'COMPLETED');
CREATE TYPE "AllocationSubjectType" AS ENUM ('COACH', 'SQUAD');
CREATE TYPE "AllocationStatus" AS ENUM ('PENDING', 'RESERVED', 'REVEALING', 'REVEALED', 'CONFIRMED', 'CORRECTED', 'CANCELLED');
CREATE TYPE "AllocationMode" AS ENUM ('RANDOM_DRAW', 'MANUAL_PREASSIGNED');

CREATE TABLE "DraftEvent" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "publicTitle" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "eventId" TEXT,
  "status" "DraftEventStatus" NOT NULL DEFAULT 'DRAFT',
  "currentStage" "DraftEventStage" NOT NULL DEFAULT 'INTRO',
  "currentAllocationId" TEXT,
  "displaySequence" INTEGER NOT NULL DEFAULT 0,
  "publicMessage" TEXT,
  "sponsorName" TEXT,
  "sponsorLogoUrl" TEXT,
  "allocationMode" "AllocationMode" NOT NULL DEFAULT 'RANDOM_DRAW',
  "displayToken" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DraftEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftSquad" (
  "id" TEXT NOT NULL,
  "draftEventId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "divisionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "publicLabel" TEXT,
  "color" TEXT,
  "iconUrl" TEXT,
  "photoUrl" TEXT,
  "sequence" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DraftSquad_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftSquadMember" (
  "id" TEXT NOT NULL,
  "draftSquadId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "sequence" INTEGER,
  "captain" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DraftSquadMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftCoachPoolEntry" (
  "id" TEXT NOT NULL,
  "draftEventId" TEXT NOT NULL,
  "divisionId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "eligibleHeadCoach" BOOLEAN NOT NULL DEFAULT true,
  "eligibleAssistantCoach" BOOLEAN NOT NULL DEFAULT false,
  "publicBio" TEXT,
  "photoUrl" TEXT,
  "sequence" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DraftCoachPoolEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftAllocation" (
  "id" TEXT NOT NULL,
  "draftEventId" TEXT NOT NULL,
  "divisionId" TEXT NOT NULL,
  "subjectType" "AllocationSubjectType" NOT NULL,
  "draftSquadId" TEXT,
  "staffId" TEXT,
  "seasonClubId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "AllocationStatus" NOT NULL DEFAULT 'PENDING',
  "randomSeed" TEXT,
  "randomMethod" TEXT,
  "candidateSnapshot" JSONB,
  "reservedAt" TIMESTAMP(3),
  "revealedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "correctedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "confirmedById" TEXT,
  "correctionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DraftAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftEvent_displayToken_key" ON "DraftEvent"("displayToken");
CREATE INDEX "DraftEvent_seasonId_status_idx" ON "DraftEvent"("seasonId", "status");
CREATE INDEX "DraftEvent_eventId_idx" ON "DraftEvent"("eventId");
CREATE UNIQUE INDEX "DraftSquad_draftEventId_divisionId_sequence_key" ON "DraftSquad"("draftEventId", "divisionId", "sequence");
CREATE INDEX "DraftSquad_seasonId_divisionId_idx" ON "DraftSquad"("seasonId", "divisionId");
CREATE UNIQUE INDEX "DraftSquadMember_draftSquadId_playerId_key" ON "DraftSquadMember"("draftSquadId", "playerId");
CREATE UNIQUE INDEX "DraftSquadMember_playerId_draftSquadId_key" ON "DraftSquadMember"("playerId", "draftSquadId");
CREATE INDEX "DraftSquadMember_playerId_idx" ON "DraftSquadMember"("playerId");
CREATE UNIQUE INDEX "DraftCoachPoolEntry_draftEventId_staffId_divisionId_key" ON "DraftCoachPoolEntry"("draftEventId", "staffId", "divisionId");
CREATE INDEX "DraftCoachPoolEntry_draftEventId_divisionId_idx" ON "DraftCoachPoolEntry"("draftEventId", "divisionId");
CREATE UNIQUE INDEX "DraftAllocation_draftEventId_subjectType_sequence_key" ON "DraftAllocation"("draftEventId", "subjectType", "sequence");
CREATE UNIQUE INDEX "DraftAllocation_draftEventId_subjectType_draftSquadId_key" ON "DraftAllocation"("draftEventId", "subjectType", "draftSquadId");
CREATE UNIQUE INDEX "DraftAllocation_draftEventId_subjectType_staffId_key" ON "DraftAllocation"("draftEventId", "subjectType", "staffId");
CREATE UNIQUE INDEX "DraftAllocation_draftEventId_subjectType_seasonClubId_divisionId_key" ON "DraftAllocation"("draftEventId", "subjectType", "seasonClubId", "divisionId");
CREATE INDEX "DraftAllocation_draftEventId_status_idx" ON "DraftAllocation"("draftEventId", "status");
CREATE INDEX "DraftAllocation_seasonClubId_idx" ON "DraftAllocation"("seasonClubId");

ALTER TABLE "DraftEvent" ADD CONSTRAINT "DraftEvent_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftEvent" ADD CONSTRAINT "DraftEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DraftEvent" ADD CONSTRAINT "DraftEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftSquad" ADD CONSTRAINT "DraftSquad_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftSquad" ADD CONSTRAINT "DraftSquad_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftSquad" ADD CONSTRAINT "DraftSquad_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftSquadMember" ADD CONSTRAINT "DraftSquadMember_draftSquadId_fkey" FOREIGN KEY ("draftSquadId") REFERENCES "DraftSquad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftSquadMember" ADD CONSTRAINT "DraftSquadMember_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftCoachPoolEntry" ADD CONSTRAINT "DraftCoachPoolEntry_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftCoachPoolEntry" ADD CONSTRAINT "DraftCoachPoolEntry_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftCoachPoolEntry" ADD CONSTRAINT "DraftCoachPoolEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_draftSquadId_fkey" FOREIGN KEY ("draftSquadId") REFERENCES "DraftSquad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_seasonClubId_fkey" FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
