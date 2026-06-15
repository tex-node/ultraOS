-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'LEAGUE_OPERATOR', 'TEAM_MANAGER', 'COACH', 'SCOUT', 'FAN');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SeasonClubStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AthleteGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('REGISTERED', 'VERIFIED', 'COMBINE_INVITE', 'DRAFT_ELIGIBLE', 'DRAFTED', 'UNDRAFTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('HEAD_COACH', 'ASSISTANT_COACH', 'SCOUT', 'TEAM_MANAGER', 'FAN_CAPTAIN');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('NOT_STARTED', 'LIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FixtureStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('NOT_STARTED', 'LIVE', 'PAUSED', 'FINAL');

-- CreateEnum
CREATE TYPE "GameEventType" AS ENUM ('SCORE', 'REBOUND', 'ASSIST', 'STEAL', 'BLOCK', 'TURNOVER', 'FOUL', 'TIMEOUT', 'SUBSTITUTION', 'NOTE');

-- CreateEnum
CREATE TYPE "ScoutReportVisibility" AS ENUM ('PRIVATE', 'CLUB', 'LEAGUE', 'PUBLIC');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'FAN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Division" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT NOT NULL,
    "foundedYear" INTEGER,
    "status" "ClubStatus" NOT NULL DEFAULT 'ACTIVE',
    "websiteUrl" TEXT,
    "socialLinks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonClub" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "headCoachId" TEXT,
    "assistantCoachId" TEXT,
    "teamManagerId" TEXT,
    "scoutId" TEXT,
    "fanCaptainId" TEXT,
    "status" "SeasonClubStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonClub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Athlete" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "AthleteGender" NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "dominantHand" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "emergencyContact" TEXT,
    "previousTeam" TEXT,
    "photoUrl" TEXT,
    "nationality" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Athlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "seasonClubId" TEXT,
    "position" TEXT NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "weightKg" INTEGER NOT NULL,
    "jerseyNumber" INTEGER,
    "status" "PlayerStatus" NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteAward" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "seasonId" TEXT,
    "name" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteVideo" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "provider" TEXT,
    "recordedAt" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "nextPickNumber" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "seasonClubId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "doorsOpenTime" TIMESTAMP(3),
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "eventId" TEXT,
    "homeSeasonClubId" TEXT NOT NULL,
    "awaySeasonClubId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "venueId" TEXT NOT NULL,
    "status" "FixtureStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "winnerSeasonClubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentPeriod" INTEGER NOT NULL DEFAULT 1,
    "clockSecondsRemaining" INTEGER NOT NULL DEFAULT 600,
    "clockStartedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "seasonClubId" TEXT NOT NULL,
    "playerId" TEXT,
    "eventType" "GameEventType" NOT NULL,
    "points" INTEGER,
    "period" INTEGER NOT NULL,
    "clockSeconds" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStat" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "seasonClubId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "rebounds" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "steals" INTEGER NOT NULL DEFAULT 0,
    "blocks" INTEGER NOT NULL DEFAULT 0,
    "turnovers" INTEGER NOT NULL DEFAULT 0,
    "fouls" INTEGER NOT NULL DEFAULT 0,
    "minutesPlayed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamStat" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "seasonClubId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "rebounds" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "turnovers" INTEGER NOT NULL DEFAULT 0,
    "fouls" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeamStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Standing" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "seasonClubId" TEXT NOT NULL,
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "pointsFor" INTEGER NOT NULL DEFAULT 0,
    "pointsAgainst" INTEGER NOT NULL DEFAULT 0,
    "pointDifference" INTEGER NOT NULL DEFAULT 0,
    "leaguePoints" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Standing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanClub" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "captainName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FanClub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fanClubId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "whatsappNumber" TEXT,
    "source" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FanMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutReport" (
    "id" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "seasonId" TEXT,
    "visibility" "ScoutReportVisibility" NOT NULL DEFAULT 'PRIVATE',
    "rating" INTEGER NOT NULL,
    "report" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MVPVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MVPVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_name_key" ON "Sport"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_slug_key" ON "Sport"("slug");

-- CreateIndex
CREATE INDEX "Competition_sportId_isActive_idx" ON "Competition"("sportId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_sportId_name_key" ON "Competition"("sportId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_sportId_slug_key" ON "Competition"("sportId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Division_competitionId_name_key" ON "Division"("competitionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Division_competitionId_slug_key" ON "Division"("competitionId", "slug");

-- CreateIndex
CREATE INDEX "Season_competitionId_status_idx" ON "Season"("competitionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Season_competitionId_name_key" ON "Season"("competitionId", "name");

-- CreateIndex
CREATE INDEX "Club_sportId_status_idx" ON "Club"("sportId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Club_sportId_name_key" ON "Club"("sportId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Club_sportId_shortName_key" ON "Club"("sportId", "shortName");

-- CreateIndex
CREATE INDEX "SeasonClub_seasonId_divisionId_status_idx" ON "SeasonClub"("seasonId", "divisionId", "status");

-- CreateIndex
CREATE INDEX "SeasonClub_clubId_idx" ON "SeasonClub"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonClub_seasonId_clubId_divisionId_key" ON "SeasonClub"("seasonId", "clubId", "divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Athlete_email_key" ON "Athlete"("email");

-- CreateIndex
CREATE INDEX "Athlete_lastName_firstName_idx" ON "Athlete"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Player_seasonId_status_idx" ON "Player"("seasonId", "status");

-- CreateIndex
CREATE INDEX "Player_seasonClubId_idx" ON "Player"("seasonClubId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_athleteId_seasonId_key" ON "Player"("athleteId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_seasonClubId_jerseyNumber_key" ON "Player"("seasonClubId", "jerseyNumber");

-- CreateIndex
CREATE INDEX "AthleteAward_athleteId_awardedAt_idx" ON "AthleteAward"("athleteId", "awardedAt");

-- CreateIndex
CREATE INDEX "AthleteAward_seasonId_idx" ON "AthleteAward"("seasonId");

-- CreateIndex
CREATE INDEX "AthleteVideo_athleteId_recordedAt_idx" ON "AthleteVideo"("athleteId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_userId_key" ON "Staff"("userId");

-- CreateIndex
CREATE INDEX "Staff_role_idx" ON "Staff"("role");

-- CreateIndex
CREATE INDEX "Draft_seasonId_divisionId_status_idx" ON "Draft"("seasonId", "divisionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_seasonId_divisionId_name_key" ON "Draft"("seasonId", "divisionId", "name");

-- CreateIndex
CREATE INDEX "DraftPick_seasonClubId_idx" ON "DraftPick"("seasonClubId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_pickNumber_key" ON "DraftPick"("draftId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_playerId_key" ON "DraftPick"("draftId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_name_city_key" ON "Venue"("name", "city");

-- CreateIndex
CREATE INDEX "Event_seasonId_date_idx" ON "Event"("seasonId", "date");

-- CreateIndex
CREATE INDEX "Event_venueId_date_idx" ON "Event"("venueId", "date");

-- CreateIndex
CREATE INDEX "Fixture_seasonId_divisionId_scheduledAt_idx" ON "Fixture"("seasonId", "divisionId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Fixture_status_scheduledAt_idx" ON "Fixture"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Fixture_venueId_scheduledAt_idx" ON "Fixture"("venueId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Game_fixtureId_key" ON "Game"("fixtureId");

-- CreateIndex
CREATE INDEX "GameEvent_gameId_createdAt_idx" ON "GameEvent"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "GameEvent_playerId_idx" ON "GameEvent"("playerId");

-- CreateIndex
CREATE INDEX "PlayerStat_seasonClubId_idx" ON "PlayerStat"("seasonClubId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStat_gameId_playerId_key" ON "PlayerStat"("gameId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamStat_gameId_seasonClubId_key" ON "TeamStat"("gameId", "seasonClubId");

-- CreateIndex
CREATE UNIQUE INDEX "Standing_seasonClubId_key" ON "Standing"("seasonClubId");

-- CreateIndex
CREATE INDEX "Standing_seasonId_leaguePoints_won_pointDifference_pointsFo_idx" ON "Standing"("seasonId", "leaguePoints", "won", "pointDifference", "pointsFor");

-- CreateIndex
CREATE UNIQUE INDEX "FanClub_clubId_key" ON "FanClub"("clubId");

-- CreateIndex
CREATE INDEX "FanMembership_fanClubId_phone_idx" ON "FanMembership"("fanClubId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "FanMembership_userId_fanClubId_key" ON "FanMembership"("userId", "fanClubId");

-- CreateIndex
CREATE INDEX "ScoutReport_scoutId_athleteId_idx" ON "ScoutReport"("scoutId", "athleteId");

-- CreateIndex
CREATE INDEX "ScoutReport_athleteId_seasonId_visibility_idx" ON "ScoutReport"("athleteId", "seasonId", "visibility");

-- CreateIndex
CREATE INDEX "MVPVote_gameId_playerId_idx" ON "MVPVote"("gameId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "MVPVote_userId_gameId_key" ON "MVPVote"("userId", "gameId");

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Division" ADD CONSTRAINT "Division_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_headCoachId_fkey" FOREIGN KEY ("headCoachId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_assistantCoachId_fkey" FOREIGN KEY ("assistantCoachId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_teamManagerId_fkey" FOREIGN KEY ("teamManagerId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_fanCaptainId_fkey" FOREIGN KEY ("fanCaptainId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_seasonClubId_fkey" FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteAward" ADD CONSTRAINT "AthleteAward_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteAward" ADD CONSTRAINT "AthleteAward_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteVideo" ADD CONSTRAINT "AthleteVideo_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_seasonClubId_fkey" FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_homeSeasonClubId_fkey" FOREIGN KEY ("homeSeasonClubId") REFERENCES "SeasonClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_awaySeasonClubId_fkey" FOREIGN KEY ("awaySeasonClubId") REFERENCES "SeasonClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_winnerSeasonClubId_fkey" FOREIGN KEY ("winnerSeasonClubId") REFERENCES "SeasonClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_seasonClubId_fkey" FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStat" ADD CONSTRAINT "PlayerStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStat" ADD CONSTRAINT "PlayerStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStat" ADD CONSTRAINT "PlayerStat_seasonClubId_fkey" FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamStat" ADD CONSTRAINT "TeamStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamStat" ADD CONSTRAINT "TeamStat_seasonClubId_fkey" FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_seasonClubId_fkey" FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanClub" ADD CONSTRAINT "FanClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanMembership" ADD CONSTRAINT "FanMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanMembership" ADD CONSTRAINT "FanMembership_fanClubId_fkey" FOREIGN KEY ("fanClubId") REFERENCES "FanClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MVPVote" ADD CONSTRAINT "MVPVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MVPVote" ADD CONSTRAINT "MVPVote_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MVPVote" ADD CONSTRAINT "MVPVote_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
