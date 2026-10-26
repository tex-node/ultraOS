-- Public final results for a completed event (podiums/standings), rendered on the public event page.
-- Nullable and additive: existing events are unaffected.
ALTER TABLE "Event" ADD COLUMN "results" JSONB;
