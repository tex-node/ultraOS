-- Streak v5, Prompt 2: the partner data-feed tables.
--
-- Two tenant tables, both created WITH row-level security enabled and FORCED, a tenant_isolation policy,
-- and the runtime-role GRANTs in this same file (docs/patterns/tenant-database-migrations.md). The
-- delivery -> subscription foreign key is COMPOSITE on (organizationId, subscriptionId) so a delivery can
-- never point at another tenant's subscription even if a bug lets a foreign id through.

-- 1. Enums
CREATE TYPE "DataFeedEventType" AS ENUM ('GAME_STARTED', 'SCORE_CHANGED', 'GAME_FINAL');
CREATE TYPE "DataFeedDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'GAVE_UP', 'FAILED');

-- 2. Tables
CREATE TABLE "DataFeedSubscription" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
  "name"           TEXT NOT NULL,
  "webhookUrl"     TEXT NOT NULL,
  "secret"         TEXT NOT NULL,
  "events"         "DataFeedEventType"[],
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataFeedSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataFeedDelivery" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
  "subscriptionId" TEXT NOT NULL,
  "gameId"         TEXT NOT NULL,
  "eventType"      "DataFeedEventType" NOT NULL,
  "eventData"      JSONB NOT NULL,
  "sentPayload"    JSONB,
  "status"         "DataFeedDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastStatusCode" INTEGER,
  "lastError"      TEXT,
  "deliveredAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataFeedDelivery_pkey" PRIMARY KEY ("id")
);

-- 3. Keys, indexes, constraints
CREATE UNIQUE INDEX "DataFeedSubscription_organizationId_id_key" ON "DataFeedSubscription"("organizationId", "id");
CREATE INDEX "DataFeedSubscription_organizationId_isActive_idx" ON "DataFeedSubscription"("organizationId", "isActive");

CREATE INDEX "DataFeedDelivery_organizationId_status_nextAttemptAt_idx" ON "DataFeedDelivery"("organizationId", "status", "nextAttemptAt");
CREATE INDEX "DataFeedDelivery_subscriptionId_createdAt_idx" ON "DataFeedDelivery"("subscriptionId", "createdAt");
CREATE INDEX "DataFeedDelivery_gameId_idx" ON "DataFeedDelivery"("gameId");

ALTER TABLE "DataFeedSubscription" ADD CONSTRAINT "DataFeedSubscription_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataFeedSubscription" ADD CONSTRAINT "DataFeedSubscription_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DataFeedDelivery" ADD CONSTRAINT "DataFeedDelivery_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataFeedDelivery" ADD CONSTRAINT "DataFeedDelivery_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Composite tenant-aware FK: the subscription must belong to the SAME organization as the delivery.
ALTER TABLE "DataFeedDelivery" ADD CONSTRAINT "DataFeedDelivery_organizationId_subscriptionId_fkey"
  FOREIGN KEY ("organizationId", "subscriptionId") REFERENCES "DataFeedSubscription"("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Row-level security: enable AND force (the table owner must be subject to it too), plus a policy that
--    compares against the transaction's tenant setting.
ALTER TABLE "DataFeedSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataFeedSubscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "DataFeedSubscription"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "DataFeedDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataFeedDelivery" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "DataFeedDelivery"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

-- 5. Runtime-role GRANTs, in the same migration as the tables (the 42501 lesson: a table created without
--    these is invisible to the app and the failure looks like "permission denied", not "missing migration").
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataFeedSubscription" TO ultraos;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataFeedDelivery" TO ultraos;
