CREATE TYPE "OpsHealthStatus" AS ENUM ('GREEN', 'AMBER', 'RED');
CREATE TYPE "OpsItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED', 'CANCELLED');
CREATE TYPE "OpsSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "IncidentType" AS ENUM ('MEDICAL', 'TECHNICAL', 'VENUE', 'POWER', 'NETWORK', 'OFFICIAL', 'PLAYER', 'FAN', 'SECURITY', 'OTHER');
CREATE TYPE "EquipmentStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_USE', 'MAINTENANCE', 'MISSING', 'RETIRED');
CREATE TYPE "DisplaySurface" AS ENUM ('PUBLIC_DISPLAY', 'MC_SCREEN', 'OPERATOR_SCREEN', 'OVERLAY', 'SCOREBOARD');

CREATE TABLE "OperationalChecklist" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "eventId" TEXT,
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalChecklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalChecklistItem" (
  "id" TEXT NOT NULL,
  "checklistId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "ownerUserId" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "completedById" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Incident" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" "IncidentType" NOT NULL,
  "severity" "OpsSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "eventId" TEXT,
  "ownerUserId" TEXT,
  "description" TEXT,
  "timeline" JSONB,
  "resolution" TEXT,
  "reportedById" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Runbook" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "eventId" TEXT,
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Runbook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RunbookTask" (
  "id" TEXT NOT NULL,
  "runbookId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "responsible" TEXT,
  "dueAt" TIMESTAMP(3),
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "attachments" JSONB,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RunbookTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperatorMessage" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "severity" "OpsSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "eventId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperatorMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisplayHeartbeat" (
  "id" TEXT NOT NULL,
  "eventId" TEXT,
  "surface" "DisplaySurface" NOT NULL,
  "label" TEXT NOT NULL,
  "status" "OpsHealthStatus" NOT NULL DEFAULT 'AMBER',
  "lastSeenAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DisplayHeartbeat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Rehearsal" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "eventId" TEXT,
  "rehearsalDate" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER,
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "issuesFound" TEXT,
  "issuesResolved" TEXT,
  "outstandingActions" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Rehearsal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Equipment" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "serial" TEXT,
  "assignedOperatorId" TEXT,
  "status" "EquipmentStatus" NOT NULL DEFAULT 'AVAILABLE',
  "batteryPercent" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventStaffAssignment" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "userId" TEXT,
  "staffId" TEXT,
  "personName" TEXT,
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventStaffAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VenueZone" (
  "id" TEXT NOT NULL,
  "eventId" TEXT,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "capacity" INTEGER,
  "occupancy" INTEGER NOT NULL DEFAULT 0,
  "status" "OpsHealthStatus" NOT NULL DEFAULT 'GREEN',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VenueZone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpsTask" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "eventId" TEXT,
  "ownerUserId" TEXT,
  "dueAt" TIMESTAMP(3),
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "OpsSeverity" NOT NULL DEFAULT 'MEDIUM',
  "dependsOnId" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpsTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpsNotification" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" "OpsSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "eventId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpsNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpsDocument" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "eventId" TEXT,
  "fileUrl" TEXT,
  "notes" TEXT,
  "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpsDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalChecklist_eventId_status_idx" ON "OperationalChecklist"("eventId", "status");
CREATE INDEX "OperationalChecklist_category_status_idx" ON "OperationalChecklist"("category", "status");
CREATE INDEX "OperationalChecklistItem_checklistId_status_idx" ON "OperationalChecklistItem"("checklistId", "status");
CREATE INDEX "OperationalChecklistItem_ownerUserId_dueAt_idx" ON "OperationalChecklistItem"("ownerUserId", "dueAt");
CREATE INDEX "Incident_eventId_status_severity_idx" ON "Incident"("eventId", "status", "severity");
CREATE INDEX "Incident_type_status_idx" ON "Incident"("type", "status");
CREATE INDEX "Runbook_eventId_status_idx" ON "Runbook"("eventId", "status");
CREATE INDEX "Runbook_category_status_idx" ON "Runbook"("category", "status");
CREATE INDEX "RunbookTask_runbookId_status_dueAt_idx" ON "RunbookTask"("runbookId", "status", "dueAt");
CREATE INDEX "OperatorMessage_eventId_status_severity_idx" ON "OperatorMessage"("eventId", "status", "severity");
CREATE INDEX "OperatorMessage_createdAt_idx" ON "OperatorMessage"("createdAt");
CREATE UNIQUE INDEX "DisplayHeartbeat_eventId_surface_label_key" ON "DisplayHeartbeat"("eventId", "surface", "label");
CREATE INDEX "DisplayHeartbeat_eventId_status_lastSeenAt_idx" ON "DisplayHeartbeat"("eventId", "status", "lastSeenAt");
CREATE INDEX "Rehearsal_eventId_rehearsalDate_idx" ON "Rehearsal"("eventId", "rehearsalDate");
CREATE INDEX "Rehearsal_type_status_idx" ON "Rehearsal"("type", "status");
CREATE UNIQUE INDEX "Equipment_serial_key" ON "Equipment"("serial");
CREATE INDEX "Equipment_type_status_idx" ON "Equipment"("type", "status");
CREATE INDEX "Equipment_assignedOperatorId_idx" ON "Equipment"("assignedOperatorId");
CREATE UNIQUE INDEX "EventStaffAssignment_eventId_role_userId_key" ON "EventStaffAssignment"("eventId", "role", "userId");
CREATE INDEX "EventStaffAssignment_eventId_role_status_idx" ON "EventStaffAssignment"("eventId", "role", "status");
CREATE INDEX "VenueZone_eventId_category_idx" ON "VenueZone"("eventId", "category");
CREATE INDEX "VenueZone_status_idx" ON "VenueZone"("status");
CREATE INDEX "OpsTask_eventId_status_dueAt_idx" ON "OpsTask"("eventId", "status", "dueAt");
CREATE INDEX "OpsTask_ownerUserId_dueAt_idx" ON "OpsTask"("ownerUserId", "dueAt");
CREATE INDEX "OpsTask_priority_status_idx" ON "OpsTask"("priority", "status");
CREATE INDEX "OpsNotification_eventId_status_severity_idx" ON "OpsNotification"("eventId", "status", "severity");
CREATE INDEX "OpsNotification_category_createdAt_idx" ON "OpsNotification"("category", "createdAt");
CREATE INDEX "OpsDocument_eventId_category_idx" ON "OpsDocument"("eventId", "category");
CREATE INDEX "OpsDocument_uploadedById_createdAt_idx" ON "OpsDocument"("uploadedById", "createdAt");

ALTER TABLE "OperationalChecklistItem" ADD CONSTRAINT "OperationalChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "OperationalChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunbookTask" ADD CONSTRAINT "RunbookTask_runbookId_fkey" FOREIGN KEY ("runbookId") REFERENCES "Runbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
