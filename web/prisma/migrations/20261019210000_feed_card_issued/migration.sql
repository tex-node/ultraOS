-- Streak v10, Prompt 4: a discipline event for the partner feed.
--
-- Football (and any sport with cards) cannot be priced from score changes alone: a red card changes the match more
-- than a goal does. `CARD_ISSUED` carries the player and the colour.
--
-- Enum value additions need `IF NOT EXISTS` (Postgres 12+) because a value cannot be removed and a re-run must not
-- fail. Prisma does not manage this enum's values from the schema on `migrate deploy` for an existing type, so the
-- explicit ALTER is the migration.
ALTER TYPE "DataFeedEventType" ADD VALUE IF NOT EXISTS 'CARD_ISSUED';
