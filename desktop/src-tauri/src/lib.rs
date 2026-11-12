// UltraOS Scoring — desktop shell library.
//
// Option B from documentation/architecture/DESKTOP_APP.md. The window loads the hosted Next.js app; this process adds the two
// things a browser tab cannot: a local agent the page can talk to over 127.0.0.1, and (later) a supervised vision worker.
//
// SECURITY MODEL, in one paragraph. The page is a REMOTE origin. `withGlobalTauri` is false and no capability grants IPC to it,
// so `window.__TAURI__` does not exist and the page cannot reach the filesystem or spawn anything. The privileged surface is the
// agent on 127.0.0.1:8012 instead: a fixed allow-list of four actions, a bearer token delivered as an HttpOnly cookie (so page
// JavaScript can never read it), and CORS pinned to the two origins we control. An XSS in the remote app can therefore make
// requests, but only those four, and only from an origin the agent recognises.
//
// The token is generated once per launch and never written to disk: `outbox.json` is the only persistent state todny.

use axum::{
    extract::State,
    http::{HeaderMap, HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::Arc,
    time::Duration,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tower_http::cors::{AllowOrigin, CorsLayer};

/// Where the window points. Overridable so the offline-fallback path can be exercised without unplugging anything:
/// `ULTRAOS_APP_URL=http://127.0.0.1:9/ cargo run` reproduces "the site is unreachable" in one command.
const DEFAULT_APP_URL: &str = "https://app.neonultra.ng";

/// Origins the agent will answer for. Dev server included because the desktop shell is also used against `next dev`.
const ALLOWED_ORIGINS: [&str; 2] = ["https://app.neonultra.ng", "http://localhost:3000"];

const AGENT_PORT: u16 = 8012;
const COOKIE_NAME: &str = "ultraos_agent";

#[derive(Clone)]
struct AgentState {
    token: Arc<String>,
    data_dir: Arc<PathBuf>,
    /// Set the moment the page completes its first handshake - the only reliable evidence that the remote app actually loaded.
    handshake_seen: Arc<std::sync::atomic::AtomicBool>,
}

#[derive(Deserialize)]
struct AgentRequest {
    action: String,
    #[serde(default)]
    payload: serde_json::Value,
}

#[derive(Serialize)]
struct AgentResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
}

fn ok(data: Option<serde_json::Value>) -> Json<AgentResponse> {
    Json(AgentResponse { ok: true, error: None, data })
}

fn err(message: impl Into<String>) -> Json<AgentResponse> {
    Json(AgentResponse { ok: false, error: Some(message.into()), data: None })
}

/// Read one cookie value out of the request headers without pulling in a cookie crate for a single name.
fn cookie_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|pair| {
        let mut parts = pair.trim().splitn(2, '=');
        let name = parts.next()?;
        let value = parts.next()?;
        (name == COOKIE_NAME).then(|| value.to_string())
    })
}

fn outbox_path(state: &AgentState) -> PathBuf {
    state.data_dir.join("outbox.json")
}

fn read_outbox(state: &AgentState) -> serde_json::Value {
    match std::fs::read_to_string(outbox_path(state)) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!([])),
        Err(_) => serde_json::json!([]),
    }
}

/// Append the incoming records to the outbox file. Append rather than replace: the page may call SAVE_OUTBOX per tap, and a
/// replace would silently drop anything queued between calls.
fn append_outbox(state: &AgentState, payload: &serde_json::Value) -> Result<usize, String> {
    let incoming: Vec<serde_json::Value> = match payload {
        serde_json::Value::Array(items) => items.clone(),
        serde_json::Value::Object(_) => vec![payload.clone()],
        _ => return Err("payload must be an object or an array".into()),
    };

    let mut existing = match read_outbox(state) {
        serde_json::Value::Array(items) => items,
        _ => Vec::new(),
    };
    let added = incoming.len();
    existing.extend(incoming);

    let path = outbox_path(state);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(&serde_json::Value::Array(existing))
        .map_err(|error| error.to_string())?;
    // Write-then-rename so a crash mid-write cannot leave a half-written outbox - the one file that must survive a power cut.
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, text).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|error| error.to_string())?;
    Ok(added)
}

/// The offline page, served by the agent so the webview loads a normal document.
async fn offline_page() -> impl IntoResponse {
    let app_url = std::env::var("ULTRAOS_APP_URL").unwrap_or_else(|_| DEFAULT_APP_URL.to_string());
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
        offline_fallback_html(&app_url),
    )
}

async fn handshake(State(state): State<AgentState>) -> impl IntoResponse {
    state
        .handshake_seen
        .store(true, std::sync::atomic::Ordering::SeqCst);

    // SameSite=None is required because the page's origin (app.neonultra.ng) and the agent (127.0.0.1) are cross-site; Secure is
    // required for SameSite=None, and Chromium treats 127.0.0.1 as a trustworthy origin so it accepts the cookie over http.
    let cookie = format!("{COOKIE_NAME}={}; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=43200", state.token);
    let mut response = (StatusCode::OK, "agent ready").into_response();
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response.headers_mut().insert(axum::http::header::SET_COOKIE, value);
    }
    response
}

async fn agent(State(state): State<AgentState>, headers: HeaderMap, body: axum::body::Bytes) -> impl IntoResponse {
    // The token is checked BEFORE the body is parsed. With axum's Json extractor the parse happens first, so an unauthorised
    // caller sending a malformed body got 400 instead of 401 - which tells them the route exists and is worth probing. Bytes are
    // taken raw and parsed here, after the token, so the answer to "are you allowed" never depends on what you sent.
    match cookie_token(&headers) {
        Some(token) if token == *state.token => {}
        _ => return (StatusCode::UNAUTHORIZED, err("missing or invalid agent token")),
    }

    let request: AgentRequest = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(error) => return (StatusCode::BAD_REQUEST, err(format!("invalid JSON body: {error}"))),
    };
    let body = request;

    // Every arm is an explicit (status, body) pair: axum needs one concrete return type for the handler, and a bare Json in one
    // arm and a tuple in another does not unify.
    match body.action.as_str() {
        "PING" => (
            StatusCode::OK,
            ok(Some(serde_json::json!({
                "status": "ok",
                "version": env!("CARGO_PKG_VERSION"),
                "store": "json",
            }))),
        ),
        "SAVE_OUTBOX" => match append_outbox(&state, &body.payload) {
            Ok(count) => (
                StatusCode::OK,
                ok(Some(serde_json::json!({
                    "saved": count,
                    "pending": read_outbox(&state).as_array().map(|items| items.len()).unwrap_or(0),
                }))),
            ),
            Err(message) => (StatusCode::BAD_REQUEST, err(message)),
        },
        "READ_OUTBOX" => (StatusCode::OK, ok(Some(read_outbox(&state)))),
        "CLEAR_OUTBOX" => match std::fs::write(outbox_path(&state), "[]") {
            Ok(_) => (StatusCode::OK, ok(Some(serde_json::json!({ "cleared": true })))),
            Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, err(error.to_string())),
        },
        other => (StatusCode::BAD_REQUEST, err(format!("unsupported action: {other}"))),
    }
}

/// Start the agent. Failure to bind (port in use, usually a second instance) is reported on stderr rather than killing the app:
/// the window still works, the page simply falls back to IndexedDB.
fn spawn_agent(data_dir: PathBuf) -> Arc<std::sync::atomic::AtomicBool> {
    let handshake_seen = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag_for_server = handshake_seen.clone();
    std::thread::spawn(move || {
        let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
            Ok(runtime) => runtime,
            Err(error) => {
                eprintln!("ultraos-agent: could not start runtime: {error}");
                return;
            }
        };

        runtime.block_on(async move {
            let origins: Vec<HeaderValue> = ALLOWED_ORIGINS
                .iter()
                .filter_map(|origin| HeaderValue::from_str(origin).ok())
                .collect();

            let cors = CorsLayer::new()
                .allow_origin(AllowOrigin::list(origins))
                .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
                .allow_headers([axum::http::header::CONTENT_TYPE])
                .allow_credentials(true);

            let state = AgentState {
                token: Arc::new(uuid::Uuid::new_v4().to_string()),
                data_dir: Arc::new(data_dir),
                handshake_seen: flag_for_server,
            };

            let app = Router::new()
                .route("/handshake", get(handshake))
                .route("/offline", get(offline_page))
                .route("/api/local/agent", post(agent))
                .layer(cors)
                .with_state(state);

            let listener = match tokio::net::TcpListener::bind(("127.0.0.1", AGENT_PORT)).await {
                Ok(listener) => listener,
                Err(error) => {
                    eprintln!("ultraos-agent: cannot bind 127.0.0.1:{AGENT_PORT}: {error}");
                    return;
                }
            };
            println!("ultraos-agent: listening on http://127.0.0.1:{AGENT_PORT}");
            let _ = axum::serve(listener, app).await;
        });
    });

    handshake_seen
}

/// The page shown when the hosted app cannot be reached. Without it the window is a white rectangle and the user has no idea
/// whether the app is broken, their wifi is off, or the laptop is out of data.
/// The page shown when the hosted app cannot be reached. Served by the agent at /offline, not as a data: URL: WebView2 renders
/// data: documents inconsistently, and a blank window is the failure this page exists to prevent.
fn offline_fallback_html(app_url: &str) -> String {
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>UltraOS Scoring</title>
<style>
  html, body {{ margin: 0; height: 100%; background: #050807; color: #e7efe9;
                font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }}
  body {{ display: flex; align-items: center; justify-content: center; }}
  .card {{ max-width: 34rem; padding: 2.5rem; text-align: center; }}
  h1 {{ font-size: 1.5rem; margin: 0 0 .75rem; }}
  p {{ color: #9fb3a8; line-height: 1.6; margin: 0 0 1.25rem; }}
  a.retry {{ display: inline-block; background: #00a05a; color: #04120c; font-weight: 600; text-decoration: none;
             padding: .75rem 1.5rem; border-radius: .5rem; }}
  code {{ background: #0d1712; padding: .15rem .4rem; border-radius: .25rem; font-size: .85em; }}
</style></head><body><div class="card">
  <h1>Unable to connect to UltraOS</h1>
  <p>This laptop cannot reach <code>{app_url}</code>. Check the internet connection, then try again.</p>
  <p>Anything already recorded on this machine is stored locally and will sync when the connection returns.</p>
  <a class="retry" href="{app_url}">Retry</a>
</div></body></html>"#
    )
}

pub fn run() {
    let app_url = std::env::var("ULTRAOS_APP_URL").unwrap_or_else(|_| DEFAULT_APP_URL.to_string());

    tauri::Builder::default()
        .setup({
            let app_url = app_url.clone();
            move |app| {
                let data_dir = app
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| PathBuf::from("."));
                let handshake_seen = spawn_agent(data_dir);

                let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url.parse()?))
                    .title("UltraOS Scoring")
                    .inner_size(1366.0, 900.0)
                    .min_inner_size(1024.0, 768.0)
                    .resizable(true)
                    // The page only probes the agent when it believes it is inside this shell. A marker in the user agent is the
                    // cheapest honest signal: a plain browser (and the test suite) never probes a loopback port that is not there.
                    .user_agent("UltraOSDesktop/1.0 (UltraOS Scoring)")
                    .build()?;

                // If the page has not finished loading shortly after launch, the site is unreachable (or the machine is
                // offline). Navigate to the embedded fallback rather than leaving a white rectangle on screen.
                let fallback = offline_fallback_html(&app_url);
                let window_for_check = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(12));
                    if handshake_seen.load(std::sync::atomic::Ordering::SeqCst) {
                        return;
                    }
                    // No handshake after 12s: the page never became the app (offline, DNS failure, captive portal, or the site is
                    // down). Showing WebView2's own error page leaves the user with no idea what to do about it.
                    println!("ultraos-shell: no handshake from the app; showing the offline page");
                    let offline_url = format!("http://127.0.0.1:{AGENT_PORT}/offline");
                    if let Ok(url) = offline_url.parse() {
                        let _ = window_for_check.navigate(url);
                    }
                });

                Ok(())
            }
        })
        .on_page_load(|window, payload| {
            // A page load that never finishes is the failure we care about; log it so a support call has something to read.
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                println!("ultraos-shell: loaded {}", payload.url());
            }
            let _ = window;
        })
        .run(tauri::generate_context!())
        .expect("error while running UltraOS Scoring");
}
