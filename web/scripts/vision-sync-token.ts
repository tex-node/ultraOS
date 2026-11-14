/**
 * Mint an agent token exactly as the desktop agent does: base64url(payload) + "." + base64url(HMAC-SHA256(AGENT_SECRET)).
 *
 * Shared by the fixture test so the token it presents is byte-identical in construction to the one `/api/vision/sync` sees in
 * production — a hand-rolled variant would prove nothing about the real verifier.
 */
import { createHmac, randomUUID } from "node:crypto";

const SECRET = process.env.AGENT_SECRET;
if (!SECRET) throw new Error("AGENT_SECRET must be set (web/.env.test has the test value)");

export function signAgentToken(input: { userId: string; orgId: string; lifetimeSeconds?: number }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    userId: input.userId,
    orgId: input.orgId,
    uuid: randomUUID(),
    iat: now,
    exp: now + (input.lifetimeSeconds ?? 3600),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET!).update(body).digest().toString("base64url");
  return `${body}.${signature}`;
}
