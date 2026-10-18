-- Streak v5, Prompt 2 fix: a delivery must be CLAIMED before it is sent.
--
-- The verification harness received the same delivery twice because two drains (the one scheduled by
-- withGameWrite and the harness's explicit one) both read the row as PENDING and both posted it. The claim is
-- now an atomic `UPDATE ... WHERE status='PENDING'`, so exactly one drain wins. `DELIVERING` is also the
-- crash-recovery marker: drainAllOrganizations resets DELIVERING rows older than 10 minutes back to PENDING.
ALTER TYPE "DataFeedDeliveryStatus" ADD VALUE IF NOT EXISTS 'DELIVERING';

-- Helps the recovery sweep find rows stuck in DELIVERING without a full scan.
CREATE INDEX "DataFeedDelivery_status_lastAttempt_idx" ON "DataFeedDelivery" ("status", "nextAttemptAt");
