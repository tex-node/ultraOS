-- Streak v14, Prompt 3: a human-confirmed AI observation becomes a partner event.
--
-- The value of the vision track to a sportsbook is not the model's guess, it is the reviewer's decision. Until now a
-- confirmation only moved a status column inside the vision tables; this event is what carries it to subscribers.
ALTER TYPE "DataFeedEventType" ADD VALUE IF NOT EXISTS 'VISION_EVENT_CONFIRMED';
