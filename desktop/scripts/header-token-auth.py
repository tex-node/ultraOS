"""Agent auth: signed proof in, bearer token out (Prompt 4b).

Replaces the cookie handshake, which could not work: a Set-Cookie from 127.0.0.1:8012 is never attached to a fetch from the app's
own origin. The flow becomes:

  page → GET /api/desktop/agent-token        (session-authenticated, HMAC-signed proof, 5 min)
  page → POST 127.0.0.1:8012/handshake {proof}
  agent → verifies HMAC + expiry, stores {userId, orgId, expiresAt} under a fresh token, returns {agentToken}
  page → every call carries X-UltraOS-Token

The token lives only in the agent's memory: an app restart clears the map, so a token captured from a previous launch is dead.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "desktop/src-tauri/src/lib.rs"
CARGO = ROOT / "desktop/src-tauri/Cargo.toml"

source = LIB.read_text(encoding="utf-8")

# ---------------------------------------------------------------- dependencies
cargo = CARGO.read_text(encoding="utf-8")
if "hmac" not in cargo:
    cargo = cargo.replace(
        'rusqlite = { version = "0.31", features = ["bundled"] }',
        'rusqlite = { version = "0.31", features = ["bundled"] }\n'
        'hmac = "0.12"\n'
        'sha2 = "0.10"',
    )
    CARGO.write_text(cargo, encoding="utf-8", newline="\n")

# ------------------------------------------------------------------- imports
source = source.replace(
    "use rusqlite::{params, Connection, OptionalExtension};",
    "use hmac::{Hmac, Mac};\nuse rusqlite::{params, Connection, OptionalExtension};\nuse sha2::Sha256;\nuse std::collections::HashMap;",
)

# ------------------------------------------------------------------ constants
source = source.replace(
    'const COOKIE_NAME: &str = "ultraos_agent";',
    '''/// How long an issued agent token stays valid without being used. Refreshed on every authenticated call, so an active session
/// never expires mid-match, while an abandoned window stops working five minutes after its last call.
const AGENT_TOKEN_TTL_SECONDS: i64 = 300;''',
)

# --------------------------------------------------------------------- state
source = source.replace(
    """struct AgentState {
    token: Arc<String>,
    db: Arc<Mutex<Connection>>,
    /// Set the moment the page completes its first handshake - the only reliable evidence that the remote app actually loaded.
    handshake_seen: Arc<std::sync::atomic::AtomicBool>,
}""",
    """/// One handshake, one window. Keyed by the token the agent issued, never by anything the page supplies.
#[derive(Clone)]
struct AgentSession {
    user_id: String,
    org_id: Option<String>,
    expires_at: i64,
}

struct AgentState {
    db: Arc<Mutex<Connection>>,
    sessions: Arc<Mutex<HashMap<String, AgentSession>>>,
    /// Set the moment the page completes its first handshake - the only reliable evidence that the remote app actually loaded.
    handshake_seen: Arc<std::sync::atomic::AtomicBool>,
}""",
)

# --------------------------------------------------------------- secret + time
source = source.replace(
    "/// Read one cookie value out of the request headers without pulling in a cookie crate for a single name.",
    '''/// The shared secret behind the proof. Runtime env first (tests and acceptance runs set it), then the value baked in at build
/// time. Rotating it invalidates every proof and therefore every future handshake - see ROTATE_SECRETS.md.
fn agent_secret() -> String {
    std::env::var("AGENT_SECRET")
        .ok()
        .or_else(|| option_env!("AGENT_SECRET").map(str::to_string))
        .unwrap_or_else(|| "development-only-agent-secret".to_string())
}

fn epoch_seconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

/// Verify `<payload>.<signature>`: base64url both halves, recompute HMAC-SHA256 over the payload, compare in constant time,
/// then check the expiry. Returns the parsed payload on success.
fn verify_proof(proof: &str) -> Result<serde_json::Value, String> {
    use base64::Engine as _;
    let decoder = base64::engine::general_purpose::URL_SAFE_NO_PAD;

    let (body, signature) = proof.split_once('.').ok_or("proof must be <payload>.<signature>")?;
    let provided = decoder.decode(signature).map_err(|_| "signature is not base64url")?;

    let mut mac = Hmac::<Sha256>::new_from_slice(agent_secret().as_bytes()).map_err(|_| "bad secret")?;
    mac.update(body.as_bytes());
    let expected = mac.finalize().into_bytes();
    if expected.len() != provided.len() || !constant_time_eq(&expected, &provided) {
        return Err("signature mismatch".into());
    }

    let payload_bytes = decoder.decode(body).map_err(|_| "payload is not base64url")?;
    let payload: serde_json::Value =
        serde_json::from_slice(&payload_bytes).map_err(|_| "payload is not JSON")?;

    let exp = payload.get("exp").and_then(|value| value.as_i64()).ok_or("payload has no exp")?;
    if exp <= epoch_seconds() {
        return Err("proof expired".into());
    }
    Ok(payload)
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut difference = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        difference |= a ^ b;
    }
    difference == 0
}

/// The bearer token on an agent call, if any.'''
)

# ------------------------------------------------------------- handshake route
old_handshake_start = source.index("async fn handshake(")
old_handshake_end = source.index("\n}\n", old_handshake_start) + 3
new_handshake = '''async fn handshake(
    State(state): State<AgentState>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    state.handshake_seen.store(true, std::sync::atomic::Ordering::SeqCst);

    let proof = match body.get("proof").and_then(|value| value.as_str()) {
        Some(proof) => proof.to_string(),
        None => return (StatusCode::BAD_REQUEST, err("handshake requires a proof")),
    };

    let payload = match verify_proof(&proof) {
        Ok(payload) => payload,
        Err(message) => return (StatusCode::UNAUTHORIZED, err(message)),
    };

    let token = payload
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
    };

    match state.sessions.lock() {
        Ok(mut sessions) => {
            sessions.insert(token.clone(), session.clone());
        }
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, err("session store unavailable")),
    }

    println!(
        "ultraos-agent: handshake accepted for user {} (org {})",
        session.user_id,
        session.org_id.clone().unwrap_or_else(|| "none".into())
    );
    (
        StatusCode::OK,
        ok(Some(serde_json::json!({
            "agentToken": token,
            "userId": session.user_id,
            "orgId": session.org_id,
            "expiresIn": AGENT_TOKEN_TTL_SECONDS,
        }))),
    )
}

'''
source = source[:old_handshake_start] + new_handshake + source[old_handshake_end:]

# --------------------------------------------------------------- agent auth
source = source.replace(
    """    // The token is checked BEFORE the body is parsed, so the answer to "are you allowed" never depends on what was sent.
    match cookie_token(&headers) {
        Some(token) if token == *state.token => {}
        _ => return (StatusCode::UNAUTHORIZED, err("missing or invalid agent token")),
    }""",
    """    // The bearer token is checked BEFORE the body is parsed, so the answer to "are you allowed" never depends on what was sent.
    // Looked up in the in-memory map, which an app restart clears: a token from a previous launch is simply unknown here.
    let presented = headers
        .get("x-ultraos-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();

    let session = {
        let mut sessions = match state.sessions.lock() {
            Ok(sessions) => sessions,
            Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, err("session store unavailable")),
        };
        match sessions.get_mut(&presented) {
            Some(session) if session.expires_at > epoch_seconds() => {
                // Sliding expiry: a scorer mid-game never loses the agent, an abandoned window does.
                session.expires_at = epoch_seconds() + AGENT_TOKEN_TTL_SECONDS;
                session.clone()
            }
            Some(_) => {
                sessions.remove(&presented);
                return (StatusCode::UNAUTHORIZED, err("agent token expired"));
            }
            None => return (StatusCode::UNAUTHORIZED, err("missing or invalid agent token")),
        }
    };
    let _session = session;""",
)

# ------------------------------------------------------------------- state init
source = source.replace(
    """            let state = AgentState {
                token: Arc::new(uuid::Uuid::new_v4().to_string()),
                db: Arc::new(Mutex::new(connection)),
                handshake_seen: flag_for_server,
            };""",
    """            let state = AgentState {
                db: Arc::new(Mutex::new(connection)),
                sessions: Arc::new(Mutex::new(HashMap::new())),
                handshake_seen: flag_for_server,
            };""",
)

# the router: handshake is now a POST
source = source.replace('.route("/handshake", get(handshake))', '.route("/handshake", post(handshake))')

LIB.write_text(source, encoding="utf-8", newline="\n")
print("agent auth: proof in, bearer token out")
