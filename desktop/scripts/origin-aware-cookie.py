"""Make the agent cookie survive the page that sets it.

The acceptance run found the handshake returning 200 while every authenticated call returned 401: the cookie was set with
`SameSite=None; Secure` and then never sent back. `Secure` is only honoured over a trustworthy origin, and the shell can be
pointed at a plain-http loopback origin (`ULTRAOS_APP_URL=http://127.0.0.1:4120` for a staging acceptance run). A cookie the
browser refuses to store looks exactly like a wrong token from the other side.

So the attributes follow the request's Origin:
  * an http loopback origin gets `SameSite=Lax` and no `Secure` - same site (the IP is the site; ports do not matter), so Lax is
    enough and it is actually stored;
  * anything else keeps `SameSite=None; Secure`, which is required because app.neonultra.ng and 127.0.0.1 are different sites.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "desktop/src-tauri/src/lib.rs"
source = LIB.read_text(encoding="utf-8")

OLD = '''async fn handshake(State(state): State<AgentState>) -> impl IntoResponse {
    state.handshake_seen.store(true, std::sync::atomic::Ordering::SeqCst);

    // SameSite=None is required because the page's origin (app.neonultra.ng) and the agent (127.0.0.1) are cross-site; Secure is
    // required for SameSite=None, and Chromium treats 127.0.0.1 as a trustworthy origin so it accepts the cookie over http.
    let cookie = format!("{COOKIE_NAME}={}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=43200", state.token);
    let mut response = (StatusCode::OK, "agent ready").into_response();
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response.headers_mut().insert(axum::http::header::SET_COOKIE, value);
    }
    response
}'''

NEW = '''async fn handshake(State(state): State<AgentState>, headers: HeaderMap) -> impl IntoResponse {
    state.handshake_seen.store(true, std::sync::atomic::Ordering::SeqCst);

    // Attributes follow the origin that is asking. A shell pointed at an http loopback origin (staging acceptance runs) needs a
    // cookie the browser will actually store: SameSite=Lax, no Secure. The deployed pair (app.neonultra.ng -> 127.0.0.1) is
    // cross-site and needs SameSite=None; Secure.
    let origin = headers
        .get(axum::http::header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let loopback = origin.starts_with("http://127.0.0.1") || origin.starts_with("http://localhost");
    let attributes = if loopback {
        "HttpOnly; SameSite=Lax; Path=/; Max-Age=43200"
    } else {
        "HttpOnly; SameSite=None; Secure; Path=/; Max-Age=43200"
    };
    let cookie = format!("{COOKIE_NAME}={}; {attributes}", state.token);

    let mut response = (StatusCode::OK, "agent ready").into_response();
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response.headers_mut().insert(axum::http::header::SET_COOKIE, value);
    }
    response
}'''

if "SameSite=Lax" in source:
    print("handshake already origin-aware")
    raise SystemExit(0)
if OLD not in source:
    raise SystemExit("handshake block changed - not patched")

LIB.write_text(source.replace(OLD, NEW), encoding="utf-8", newline="\n")
print("handshake: cookie attributes now follow the origin")
