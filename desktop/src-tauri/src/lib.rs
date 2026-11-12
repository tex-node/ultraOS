// UltraOS Scoring — desktop shell library.
//
// Option B from documentation/architecture/DESKTOP_APP.md. The window loads the hosted Next.js app; this process adds the two
// things a browser tab cannot: a local agent the page can talk to over 127.0.0.1, and (later) a supervised vision worker.
//
// SECURITY MODEL, in one paragraph. The page is a REMOTE origin. `withGlobalTauri` is false and no capability grants IPC to it,
// so `window.__TAURI__` does not exist and the page cannot reach the filesystem or spawn anything. The privileged surface is the
// agent on 127.0.0.1:8012: a fixed allow-list of actions, a bearer token delivered as an HttpOnly cookie (page JavaScript can
// never read it), and CORS pinned to the two origins we control.
//
// STORAGE. SQLite in WAL mode, at <app data>/ultraos/outbox.db. WAL is not a detail: with the default rollback journal a crash
// mid-write (battery, force-quit, Windows Update) rolls back the last transactions silently. A scorer can go half an hour
// without syncing, so "the last five taps vanished" is a real failure mode rather than a theoretical one.

use axum::{
    extract::State,
    http::{HeaderMap, HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tower_http::cors::{AllowOrigin, CorsLayer};

/// Where the window points. Overridable so the offline-fallback path can be exercised without unplugging anything:
/// `ULTRAOS_APP_URL=http://127.0.0.1:9/ cargo run` reproduces "the site is unreachable" in one command.
const DEFAULT_APP_URL: &str = "https://app.neonultra.ng";

/// Origins the agent will answer for. Dev server included because the desktop shell is also used against `next dev`.
const ALLOWED_ORIGINS: [&str; 2] = ["https://app.neonultra.ng", "http://localhost:3000"];

/// The origin the agent should also trust: whatever the window is actually pointed at. Without this, pointing the shell at
/// staging blocks the agent on our own CORS rule, and the failure looks like "the desktop app cannot see its agent".
fn origin_of(url: &str) -> Option<String> {
    let parts: Vec<&str> = url.splitn(4, '/').collect();
    if parts.len() >= 3 && !parts[2].is_empty() {
        Some(format!("{}//{}", parts[0], parts[2]))
    } else {
        None
    }
}

const AGENT_PORT: u16 = 8012;
const COOKIE_NAME: &str = "ultraos_agent";
const DEAD_LETTER_THRESHOLD: i64 = 5;

#[derive(Clone)]
struct AgentState {
    token: Arc<String>,
    db: Arc<Mutex<Connection>>,
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
        let mut parts = pair.splitn(2, '=');
        let name = parts.next()?;
        let value = parts.next()?;
        (name == COOKIE_NAME).then(|| value.to_string())
    })
}

/// Open the outbox database, creating the directory, the file and the schema if they do not exist yet.
fn open_database(data_dir: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let directory = data_dir.join("ultraos");
    std::fs::create_dir_all(&directory).ok();
    let path = directory.join("outbox.db");
    let connection = Connection::open(path)?;

    // WAL + NORMAL: commits go to the write-ahead log, which survives a crash. This is what makes "the last tap is still there
    // after the battery dies" true rather than hopeful.
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    connection.busy_timeout(Duration::from_secs(5))?;

    connection.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS outbox (
          localId          INTEGER PRIMARY KEY AUTOINCREMENT,
          entityType       TEXT NOT NULL,
          entityId         TEXT NOT NULL,
          operation        TEXT NOT NULL,
          payload          TEXT NOT NULL,
          clientUpdatedAt  TEXT NOT NULL,
          idempotencyKey   TEXT UNIQUE NOT NULL,
          deviceId         TEXT,
          syncedAt         TEXT,
          failureReason    TEXT,
          attemptCount     INTEGER NOT NULL DEFAULT 0,
          deadLetteredAt   TEXT,
          lastManualRetryAt TEXT,
          ledgerSourceHint TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pending ON outbox(syncedAt, deadLetteredAt);
        "#,
    )?;
    Ok(connection)
}

fn as_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value.get(key).and_then(|item| item.as_str()).map(str::to_string)
}

/// INSERT OR IGNORE: UNIQUE(idempotencyKey) is the retry-safety story. A duplicate POST - the page retrying after a timeout, or
/// the browser mirror racing the agent - cannot double-write a tap.
fn save_outbox(state: &AgentState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let records: Vec<serde_json::Value> = match payload {
        serde_json::Value::Array(items) => items.clone(),
        serde_json::Value::Object(_) => vec![payload.clone()],
        _ => return Err("payload must be an object or an array".into()),
    };

    let connection = state.db.lock().map_err(|_| "database lock poisoned")?;
    let mut saved = 0usize;
    for record in &records {
        let idempotency_key = as_string(record, "idempotencyKey").ok_or("record is missing idempotencyKey")?;
        let entity_type = as_string(record, "entityType").ok_or("record is missing entityType")?;
        let entity_id = as_string(record, "entityId").unwrap_or_default();
        let operation = as_string(record, "operation").unwrap_or_default();
        let client_updated_at = as_string(record, "clientUpdatedAt").unwrap_or_default();
        let device_id = as_string(record, "deviceId");
        let ledger_hint = as_string(record, "ledgerSourceHint");
        let payload_json = serde_json::to_string(record.get("payload").unwrap_or(&serde_json::Value::Null))
            .map_err(|error| error.to_string())?;

        let inserted = connection
            .execute(
                "INSERT OR IGNORE INTO outbox
                   (entityType, entityId, operation, payload, clientUpdatedAt, idempotencyKey, deviceId, ledgerSourceHint)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![entity_type, entity_id, operation, payload_json, client_updated_at, idempotency_key, device_id, ledger_hint],
            )
            .map_err(|error| error.to_string())?;
        saved += inserted;
    }

    let pending: i64 = connection
        .query_row("SELECT COUNT(*) FROM outbox WHERE syncedAt IS NULL AND deadLetteredAt IS NULL", [], |row| row.get(0))
        .unwrap_or(0);

    Ok(serde_json::json!({ "received": records.len(), "saved": saved, "pending": pending }))
}

fn read_outbox(state: &AgentState) -> Result<serde_json::Value, String> {
    let connection = state.db.lock().map_err(|_| "database lock poisoned")?;
    let mut statement = connection
        .prepare(
            "SELECT localId, entityType, entityId, operation, payload, clientUpdatedAt, idempotencyKey, deviceId,
                    syncedAt, failureReason, attemptCount, deadLetteredAt, lastManualRetryAt, ledgerSourceHint
             FROM outbox
             WHERE syncedAt IS NULL AND deadLetteredAt IS NULL
             ORDER BY clientUpdatedAt ASC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let payload_text: String = row.get(4)?;
            let payload: serde_json::Value = serde_json::from_str(&payload_text).unwrap_or(serde_json::Value::Null);
            Ok(serde_json::json!({
                "localId": row.get::<_, i64>(0)?,
                "entityType": row.get::<_, String>(1)?,
                "entityId": row.get::<_, String>(2)?,
                "operation": row.get::<_, String>(3)?,
                "payload": payload,
                "clientUpdatedAt": row.get::<_, String>(5)?,
                "idempotencyKey": row.get::<_, String>(6)?,
                "deviceId": row.get::<_, Option<String>>(7)?,
                "syncedAt": row.get::<_, Option<String>>(8)?,
                "failureReason": row.get::<_, Option<String>>(9)?,
                "attemptCount": row.get::<_, i64>(10)?,
                "deadLetteredAt": row.get::<_, Option<String>>(11)?,
                "lastManualRetryAt": row.get::<_, Option<String>>(12)?,
                "ledgerSourceHint": row.get::<_, Option<String>>(13)?,
            }))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(serde_json::Value::Array(rows))
}

/// MARK_SYNCED takes per-key outcomes, never a whole batch. A batch of ten that sends nine and fails one must leave the failed
/// key queued; a blanket CLEAR would drop all ten, including the eight that need nothing and the one that needs a retry.
fn mark_synced(state: &AgentState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let keys: Vec<String> = payload
        .get("idempotencyKeys")
        .and_then(|value| value.as_array())
        .ok_or("idempotencyKeys must be an array")?
        .iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect();
    let status = as_string(payload, "status").ok_or("status is required")?;
    let failure_reason = as_string(payload, "failureReason");
    let now = chrono_now();

    let connection = state.db.lock().map_err(|_| "database lock poisoned")?;
    let mut applied = 0usize;
    let mut failed = 0usize;
    let mut dead_lettered = 0usize;

    for key in keys {
        match status.as_str() {
            "APPLIED" | "DUPLICATE" => {
                applied += connection
                    .execute(
                        "UPDATE outbox SET syncedAt = ?1, failureReason = NULL WHERE idempotencyKey = ?2",
                        params![now, key],
                    )
                    .map_err(|error| error.to_string())?;
            }
            "FAILED" | "CONFLICT" => {
                connection
                    .execute(
                        "UPDATE outbox SET attemptCount = attemptCount + 1, failureReason = ?1,
                                deadLetteredAt = CASE WHEN attemptCount + 1 >= ?2 THEN ?3 ELSE NULL END
                         WHERE idempotencyKey = ?4",
                        params![failure_reason, DEAD_LETTER_THRESHOLD, now, key],
                    )
                    .map_err(|error| error.to_string())?;
                failed += 1;
                let is_dead: Option<i64> = connection
                    .query_row(
                        "SELECT CASE WHEN deadLetteredAt IS NULL THEN 0 ELSE 1 END FROM outbox WHERE idempotencyKey = ?1",
                        params![key],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|error| error.to_string())?;
                if is_dead == Some(1) {
                    dead_lettered += 1;
                }
            }
            other => return Err(format!("unsupported status: {other}")),
        }
    }

    Ok(serde_json::json!({ "applied": applied, "failed": failed, "deadLettered": dead_lettered }))
}

/// The manual retry: reset every dead-lettered record so the next drain attempts it again.
fn retry_dead_lettered(state: &AgentState) -> Result<serde_json::Value, String> {
    let connection = state.db.lock().map_err(|_| "database lock poisoned")?;
    let changed = connection
        .execute(
            "UPDATE outbox
             SET attemptCount = 0, deadLetteredAt = NULL, failureReason = NULL, lastManualRetryAt = ?1
             WHERE deadLetteredAt IS NOT NULL",
            params![chrono_now()],
        )
        .map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "retried": changed }))
}

/// ISO-8601 UTC without pulling in chrono: SQLite stores text, and the page only ever compares these lexicographically.
fn chrono_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs() as i64;
    let days = secs / 86_400;
    let time_of_day = secs % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        time_of_day / 3600,
        (time_of_day % 3600) / 60,
        time_of_day % 60
    )
}

/// Howard Hinnant's days-to-civil conversion: no dependencies, correct for every date we care about.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// The page shown when the hosted app cannot be reached. Served by the agent at /offline, not as a data: URL: WebView2 renders
/// data: documents inconsistently, and a black rectangle is the failure this page exists to prevent.
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

async fn offline_page() -> impl IntoResponse {
    let app_url = std::env::var("ULTRAOS_APP_URL").unwrap_or_else(|_| DEFAULT_APP_URL.to_string());
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
        offline_fallback_html(&app_url),
    )
}

async fn handshake(State(state): State<AgentState>) -> impl IntoResponse {
    state.handshake_seen.store(true, std::sync::atomic::Ordering::SeqCst);

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
    // The token is checked BEFORE the body is parsed, so the answer to "are you allowed" never depends on what was sent.
    match cookie_token(&headers) {
        Some(token) if token == *state.token => {}
        _ => return (StatusCode::UNAUTHORIZED, err("missing or invalid agent token")),
    }

    let request: AgentRequest = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(error) => return (StatusCode::BAD_REQUEST, err(format!("invalid JSON body: {error}"))),
    };

    let result: Result<serde_json::Value, String> = match request.action.as_str() {
        // PING reports the pragmas because `synchronous` is per-connection: another process reading the file can see WAL (stored
        // in the header) but not the durability setting, so the agent has to answer for its own connection.
        "PING" => {
            let pragmas = state.db.lock().ok().and_then(|connection| {
                let journal: String = connection.query_row("PRAGMA journal_mode", [], |row| row.get(0)).ok()?;
                let synchronous: i64 = connection.query_row("PRAGMA synchronous", [], |row| row.get(0)).ok()?;
                Some(serde_json::json!({ "journal_mode": journal, "synchronous": synchronous }))
            });
            Ok(serde_json::json!({
                "status": "ok",
                "version": env!("CARGO_PKG_VERSION"),
                "store": "sqlite",
                "pragmas": pragmas,
            }))
        }
        "SAVE_OUTBOX" => save_outbox(&state, &request.payload),
        "READ_OUTBOX" => read_outbox(&state),
        "MARK_SYNCED" => mark_synced(&state, &request.payload),
        "RETRY_DEAD_LETTERED" => retry_dead_lettered(&state),
        // Kept as an admin escape hatch for local testing, never used by the app's production paths.
        "CLEAR_OUTBOX" => match state.db.lock() {
            Ok(connection) => match connection.execute("DELETE FROM outbox", []) {
                Ok(deleted) => Ok(serde_json::json!({ "cleared": true, "deleted": deleted })),
                Err(error) => Err(error.to_string()),
            },
            Err(_) => Err("database lock poisoned".to_string()),
        },
        other => Err(format!("unsupported action: {other}")),
    };

    match result {
        Ok(data) => (StatusCode::OK, ok(Some(data))),
        Err(message) => (StatusCode::BAD_REQUEST, err(message)),
    }
}

/// Start the agent. Failure to bind (port in use, usually a second instance) is reported on stderr rather than killing the app:
/// the window still works, the page simply falls back to IndexedDB.
fn spawn_agent(data_dir: PathBuf, app_url: String) -> Arc<std::sync::atomic::AtomicBool> {
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
            let connection = match open_database(&data_dir) {
                Ok(connection) => connection,
                Err(error) => {
                    eprintln!("ultraos-agent: cannot open outbox.db: {error}");
                    return;
                }
            };
            println!("ultraos-agent: sqlite ready at {}", data_dir.join("ultraos").join("outbox.db").display());

            let mut origin_strings: Vec<String> = ALLOWED_ORIGINS.iter().map(|origin| origin.to_string()).collect();
            if let Some(origin) = origin_of(&app_url) {
                if !origin_strings.contains(&origin) {
                    origin_strings.push(origin);
                }
            }
            let origins: Vec<HeaderValue> = origin_strings
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
                db: Arc::new(Mutex::new(connection)),
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

pub fn run() {
    let app_url = std::env::var("ULTRAOS_APP_URL").unwrap_or_else(|_| DEFAULT_APP_URL.to_string());

    tauri::Builder::default()
        .setup({
            let app_url = app_url.clone();
            move |app| {
                let data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
                let handshake_seen = spawn_agent(data_dir, app_url.clone());

                let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url.parse()?))
                    .title("UltraOS Scoring")
                    .inner_size(1366.0, 900.0)
                    .min_inner_size(1024.0, 768.0)
                    .resizable(true)
                    // The page only probes the agent when it believes it is inside this shell. A marker in the user agent is the
                    // cheapest honest signal: a plain browser (and the test suite) never probes a loopback port that is not there.
                    .user_agent("UltraOSDesktop/1.0 (UltraOS Scoring)")
                    .build()?;

                // No handshake within 12s means the page never became the app (offline, DNS, captive portal, site down). Show the
                // agent's own page rather than leaving WebView2's error document on screen.
                let window_for_check = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(12));
                    if handshake_seen.load(std::sync::atomic::Ordering::SeqCst) {
                        return;
                    }
                    println!("ultraos-shell: no handshake from the app; showing the offline page");
                    let offline_url = format!("http://127.0.0.1:{AGENT_PORT}/offline");
                    if let Ok(url) = offline_url.parse() {
                        let _ = window_for_check.navigate(url);
                    }
                });

                Ok(())
            }
        })
        .on_page_load(|_window, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                println!("ultraos-shell: loaded {}", payload.url());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running UltraOS Scoring");
}
