-- P13/A3 offline scoring sync: provenance columns + dedup/conflict ledgers. Additive only;
-- existing rows and behavior are unaffected (all new columns nullable; new tables empty).
--
-- 1. GameEvent provenance columns (deviceId, idempotencyKey, clientUpdatedAt, syncBatchId). All
--    nullable: LIVE_UI writes leave them null. The three timestamps stay distinct - domain time is
--    period/clockSeconds, clientUpdatedAt is on-device log time, createdAt is server receipt time
--    (sync lag = createdAt - clientUpdatedAt, expected to be hours).
-- 2. SyncIdempotency - dedup ledger; the unique idempotencyKey is the atomicity guarantee for the
--    sync endpoint (inserted in the same transaction as the canonical write).
-- 3. SyncConflictLog - one row per Last-Write-Wins overwrite / provenance anomaly.

-- 1. GameEvent provenance columns.
ALTER TABLE "GameEvent" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "GameEvent" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "GameEvent" ADD COLUMN "clientUpdatedAt" TIMESTAMP(3);
ALTER TABLE "GameEvent" ADD COLUMN "syncBatchId" TEXT;

-- 2. SyncIdempotency.
CREATE TABLE "SyncIdempotency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "deviceId" TEXT,
    "requestPayload" JSONB,
    "responseStatus" TEXT NOT NULL,
    "failureReason" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncIdempotency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SyncIdempotency_idempotencyKey_key" ON "SyncIdempotency"("idempotencyKey");
CREATE INDEX "SyncIdempotency_organizationId_appliedAt_idx" ON "SyncIdempotency"("organizationId", "appliedAt");
CREATE INDEX "SyncIdempotency_entityType_entityId_idx" ON "SyncIdempotency"("entityType", "entityId");
ALTER TABLE "SyncIdempotency" ADD CONSTRAINT "SyncIdempotency_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. SyncConflictLog.
CREATE TABLE "SyncConflictLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT,
    "localValue" JSONB,
    "remoteValue" JSONB,
    "resolvedTo" JSONB,
    "localUpdatedAt" TIMESTAMP(3),
    "remoteUpdatedAt" TIMESTAMP(3),
    "deviceId" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncConflictLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SyncConflictLog_organizationId_resolvedAt_idx" ON "SyncConflictLog"("organizationId", "resolvedAt");
CREATE INDEX "SyncConflictLog_entityType_entityId_idx" ON "SyncConflictLog"("entityType", "entityId");
CREATE INDEX "SyncConflictLog_deviceId_idx" ON "SyncConflictLog"("deviceId");
ALTER TABLE "SyncConflictLog" ADD CONSTRAINT "SyncConflictLog_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
