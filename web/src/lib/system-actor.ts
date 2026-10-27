import { randomUUID } from "node:crypto";

// The SYSTEM actor (streak v18, Prompt 2).
//
// AuditLog.userId is a foreign key to User, and a webhook has no user - which is why v17 wrote no audit row for a
// provider-driven plan change. Making the column nullable was one option; this is the other, and it keeps the foreign
// key intact: ONE real row per database representing the platform itself, inserted by migration
// 20261028120100_system_actor so every audit query can still join User.
//
// The id is fixed (not a cuid) so the migration, the application and a test all agree without a lookup.
export const SYSTEM_ACTOR_ID = "system00000000000000000";
export const SYSTEM_ACTOR_EMAIL = "system@ultraleagueos.local";

export function systemActorId(): string {
  return SYSTEM_ACTOR_ID;
}

/** A correlation id for a log line where no audit row is possible (e.g. an event with no organization). */
export function newCorrelationId(): string {
  return randomUUID();
}
