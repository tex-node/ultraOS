"""Tidy the vision sync route: drop the leftover helper and add the token verifier it imports."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

route = ROOT / "web/src/app/api/vision/sync/route.ts"
source = route.read_text(encoding="utf-8")
marker = "// Kept exported for the route"
if marker in source:
    source = source[: source.index(marker)].rstrip() + "\n"
source = source.replace('import { createHmac, timingSafeEqual } from "node:crypto";\n', "")
route.write_text(source, encoding="utf-8", newline="\n")

proof = ROOT / "web/src/lib/desktop/agent-proof.ts"
proof_source = proof.read_text(encoding="utf-8")
if "export function verifyAgentToken" in proof_source:
    print("verifier already present")
    raise SystemExit(0)

proof_source += '''
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
'''
proof.write_text(proof_source, encoding="utf-8", newline="\n")
print("verifyAgentToken added")
