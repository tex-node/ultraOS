import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// The signed proof that lets the desktop agent trust a page (Prompt 4b).
//
// WHY A PROOF AND NOT A COOKIE. A `Set-Cookie` from `127.0.0.1:8012` is never attached to a fetch from the app's own origin - the
// acceptance run proved it (cookie stored, request 401). So the page asks the server for a short-lived signed statement, hands it
// to the agent, and the agent answers with a bearer token bound to that session.
//
// WHY HMAC AND NOT JUST A RANDOM STRING. A random string would be issued to anyone who could reach the endpoint, and the agent
// would have no way to know it came from us. The HMAC binds userId/orgId/expiry to a secret that only the deployment and the
// desktop build hold.
//
// The userId and orgId are carried for logging and for scoping later server-side work (vision sync); they are not the
// authorization decision - the fact that a signed proof exists at all is.

export const PROOF_TTL_SECONDS = 300;

export type AgentProofPayload = {
  userId: string;
  orgId: string | null;
  agentToken: string;
  iat: number;
  exp: number;
};

function secret(): string {
  const value = process.env.AGENT_SECRET;
  if (!value) {
    // Fail loudly in production: silently falling back to a default would make every deployment's proofs interchangeable.
    if (process.env.NODE_ENV === "production") throw new Error("AGENT_SECRET is not configured");
    return "development-only-agent-secret";
  }
  return value;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function signAgentProof(input: { userId: string; orgId: string | null }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AgentProofPayload = {
    userId: input.userId,
    orgId: input.orgId,
    agentToken: randomUUID(),
    iat: now,
    exp: now + PROOF_TTL_SECONDS,
  };
  const body = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret()).update(body).digest();
  return `${body}.${encode(signature)}`;
}

/** Used by tests and by the verification fixture; the agent verifies the same way in Rust. */
export function verifyAgentProof(proof: string, nowSeconds = Math.floor(Date.now() / 1000)): AgentProofPayload | null {
  const [body, signature] = proof.split(".");
  if (!body || !signature) return null;

  const expected = createHmac("sha256", secret()).update(body).digest();
  const provided = Buffer.from(signature, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AgentProofPayload;
    if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) return null;
    if (typeof payload.agentToken !== "string" || payload.agentToken.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

// The agent mints its own bearer token after the handshake (Prompt 5c-i): `base64url({userId, orgId, uuid, iat, exp}).base64url(sig)`
// under the same secret. Verifying it here is what lets `/api/vision/sync` learn the organization without being told, so a body
// that claims a different org is a contradiction rather than an instruction.
export type AgentTokenClaims = {
  userId: string;
  orgId: string | null;
  uuid: string;
  iat: number;
  exp: number;
};

export function verifyAgentToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): AgentTokenClaims | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = createHmac("sha256", secret()).update(body).digest();
  const provided = Buffer.from(signature, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AgentTokenClaims;
    if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null;
    if (typeof claims.userId !== "string" || claims.userId.length === 0) return null;
    return claims;
  } catch {
    return null;
  }
}
