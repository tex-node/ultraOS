-- Streak v12, Prompt 2: the live win probability, for sportsbook partners.
--
-- A partner can compute this from a score update, but only with their own model. Emitting ours means the feed
-- states what our engine believes, with the model named, and a partner can disagree with a number instead of
-- reverse-engineering one.
ALTER TYPE "DataFeedEventType" ADD VALUE IF NOT EXISTS 'WIN_PROBABILITY_UPDATED';
