"""Signed agent token (Prompt 5c-i).

Today the agent hands the page an opaque UUID. The agent can check it against its own map, but the server cannot check it at all -
which means `/api/vision/sync` would have to trust an `organizationId` from the request body. That is the tenancy bug this change
removes.

The handshake now mints its own signed blob - `base64url({userId, orgId, uuid, iat, exp}) + "." + base64url(HMAC-SHA256)` - so the
same token is verifiable by the agent (map + signature) and by the server (signature alone, which is how it learns the org without
being told).

The in-memory map stays as the first gate on purpose: a restart clears it, so a token captured from a previous launch stops working
even though its signature is still valid for 24 hours.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "desktop/src-tauri/src/lib.rs"
source = LIB.read_text(encoding="utf-8")

if "fn sign_agent_token(" in source:
    print("signed token already present")
    raise SystemExit(0)

# 1. the minting helper, next to verify_proof
source = source.replace(
    "fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {",
    '''/// Mint the bearer token the page will send. Same construction as the server's proof, but the payload is this agent's own:
/// `{userId, orgId, uuid, iat, exp}` signed with the shared secret, so `/api/vision/sync` can verify it and read the org from it
/// rather than from a request body.
fn sign_agent_token(user_id: &str, org_id: Option<&str>, lifetime_seconds: i64) -> (String, i64) {
    use base64::Engine as _;
    let encoder = base64::engine::general_purpose::URL_SAFE_NO_PAD;

    let now = epoch_seconds();
    let expires_at = now + lifetime_seconds;
    let payload = serde_json::json!({
        "userId": user_id,
        "orgId": org_id,
        "uuid": uuid::Uuid::new_v4().to_string(),
        "iat": now,
        "exp": expires_at,
    });
    let body = encoder.encode(payload.to_string().as_bytes());

    let mut mac = Hmac::<Sha256>::new_from_slice(agent_secret().as_bytes()).expect("hmac accepts any key length");
    mac.update(body.as_bytes());
    let signature = encoder.encode(mac.finalize().into_bytes());

    (format!("{body}.{signature}"), expires_at)
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {''',
)

# 2. handshake mints instead of echoing the server's UUID
old = '''    let token = payload
        .get("agentToken")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    if token.is_empty() {
        return (StatusCode::UNAUTHORIZED, err("proof has no agentToken"));
    }

    let session = AgentSession {
        user_id: payload.get("userId").and_then(|value| value.as_str()).unwrap_or("").to_string(),
        org_id: payload.get("orgId").and_then(|value| value.as_str()).map(str::to_string),
        expires_at: epoch_seconds() + AGENT_TOKEN_TTL_SECONDS,
    };'''
new = '''    let user_id = payload.get("userId").and_then(|value| value.as_str()).unwrap_or("").to_string();
    if user_id.is_empty() {
        return (StatusCode::UNAUTHORIZED, err("proof has no userId"));
    }
    let org_id = payload.get("orgId").and_then(|value| value.as_str()).map(str::to_string);

    // 24 hours: the token outlives a match, and the map below is what a restart clears. The server verifies the signature and the
    // expiry; nothing about the org comes from the caller.
    let (token, expires_at) = sign_agent_token(&user_id, org_id.as_deref(), AGENT_TOKEN_LIFETIME_SECONDS);

    let session = AgentSession {
        user_id: user_id.clone(),
        org_id: org_id.clone(),
        expires_at,
    };'''
if old not in source:
    raise SystemExit("handshake session block changed - not patched")
source = source.replace(old, new, 1)

# 3. a 24h lifetime constant
source = source.replace(
    "const AGENT_TOKEN_TTL_SECONDS: i64 = 300;",
    '''const AGENT_TOKEN_TTL_SECONDS: i64 = 300;

/// Lifetime of the token the agent mints for itself. Longer than the proof because it is what the page keeps, and because a match
/// can outlast a five-minute window; the in-memory map is what bounds it to one launch.
const AGENT_TOKEN_LIFETIME_SECONDS: i64 = 86_400;''',
)

LIB.write_text(source, encoding="utf-8", newline="\n")
print("handshake now mints a signed token")
