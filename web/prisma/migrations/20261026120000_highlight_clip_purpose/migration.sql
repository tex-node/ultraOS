-- Streak v15, Prompt 4: highlights.
--
-- A confirmed observation can now be cut out of the game video and stored as its own media asset, so "the 3 at 12:05"
-- is a clip a fan can watch rather than a row in a review queue.
ALTER TYPE "MediaAssetPurpose" ADD VALUE IF NOT EXISTS 'HIGHLIGHT_CLIP';
