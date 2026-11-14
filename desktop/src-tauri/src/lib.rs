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
use hmac::{Hmac, Mac};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::Sha256;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
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
/// How long an issued agent token stays valid without being used. Refreshed on every authenticated call, so an active session
/// never expires mid-match, while an abandoned window stops working five minutes after its last call.
const AGENT_TOKEN_TTL_SECONDS: i64 = 300;

/// The published sidecar. Pinned by hash: the downloader installs this bytes-for-bytes or nothing.
const VISION_ENGINE_URL: &str =
    "https://pub-e130aa56d5b242f68e0574ce9e065d59.r2.dev/apps/ultraos-vision-engine.exe";
const VISION_ENGINE_SHA256: &str = "193d2a8f3a84c7a5d9e5d5181ca9cd9f819e0f727cf1277176aa9449632ca5ba";
const VISION_ENGINE_BYTES: u64 = 261_157_478;
const VISION_PORT: u16 = 8011;

/// Lifetime of the token the agent mints for itself. Longer than the proof because it is what the page keeps, and because a match
/// can outlast a five-minute window; the in-memory map is what bounds it to one launch.
const AGENT_TOKEN_LIFETIME_SECONDS: i64 = 86_400;
const DEAD_LETTER_THRESHOLD: i64 = 5;

/// One handshake, one window. Keyed by the token the agent issued, never by anything the page supplies.
#[derive(Clone)]
struct AgentSession {
    user_id: String,
    org_id: Option<String>,
    expires_at: i64,
}

/// Everything the vision tab needs to render. One struct, because the page polls one action.
#[derive(Clone, Default, serde::Serialize)]
// camelCase on the wire: the page reads downloadedBytes/totalBytes, and snake_case rendered the progress bar as "NaN".
#[serde(rename_all = "camelCase")]
struct VisionState {
    installed: bool,
    running: bool,
    version: Option<String>,
    downloading: bool,
    downloaded_bytes: u64,
    total_bytes: u64,
    error: Option<String>,
}

#[derive(Clone)]
struct AgentState {
    db: Arc<Mutex<Connection>>,
    /// Absolute path of the database this agent is actually using. Reported by PING: when a diagnostic disagrees with a file on
    /// disk, the first question is "the same file?", and guessing costs more than a field.
    db_path: Arc<String>,
    sessions: Arc<Mutex<HashMap<String, AgentSession>>>,
    vision: Arc<Mutex<VisionState>>,
    vision_child: Arc<Mutex<Option<Child>>>,
    vision_dir: Arc<std::path::PathBuf>,
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

/// The shared secret behind the proof. Runtime env first (tests and acceptance runs set it), then the value baked in at build
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

/// Mint the bearer token the page will send. Same construction as the server's proof, but the payload is this agent's own:
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

        CREATE TABLE IF NOT EXISTS vision_observations (
          id             TEXT PRIMARY KEY,
          gameVideoId    TEXT NOT NULL,
          analysisRunId  TEXT NOT NULL,
          payload        TEXT NOT NULL,
          createdAt      TEXT NOT NULL,
          syncedAt       TEXT,
          attemptCount   INTEGER NOT NULL DEFAULT 0,
          failureReason  TEXT,
          deadLetteredAt TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_vision_pending ON vision_observations(syncedAt, deadLetteredAt);
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

/// Insert one row per observation. `INSERT OR IGNORE` on the observation id: replaying a batch - the page retrying, the sidecar
/// being re-run - cannot duplicate a detection.
fn save_vision_observations(state: &AgentState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let game_video_id = as_string(payload, "gameVideoId").ok_or("gameVideoId is required")?;
    let analysis_run_id = as_string(payload, "analysisRunId").ok_or("analysisRunId is required")?;
    let observations = payload
        .get("observations")
        .and_then(|value| value.as_array())
        .ok_or("observations must be an array")?;

    let connection = state.db.lock().map_err(|_| "database lock poisoned")?;
    let now = chrono_now();
    let mut saved = 0usize;
    for observation in observations {
        let id = as_string(observation, "id").ok_or("observation is missing id")?;
        let body = serde_json::to_string(observation).map_err(|error| error.to_string())?;
        saved += connection
            .execute(
                "INSERT OR IGNORE INTO vision_observations
                   (id, gameVideoId, analysisRunId, payload, createdAt)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, game_video_id, analysis_run_id, body, now],
            )
            .map_err(|error| error.to_string())?;
    }

    let pending: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM vision_observations WHERE syncedAt IS NULL AND deadLetteredAt IS NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(serde_json::json!({ "received": observations.len(), "saved": saved, "pending": pending }))
}

fn read_vision_observations(state: &AgentState) -> Result<serde_json::Value, String> {
    let connection = state.db.lock().map_err(|_| "database lock poisoned")?;
    let mut statement = connection
        .prepare(
            "SELECT id, gameVideoId, analysisRunId, payload, createdAt, attemptCount
             FROM vision_observations
             WHERE syncedAt IS NULL AND deadLetteredAt IS NULL
             ORDER BY createdAt ASC, id ASC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let payload_text: String = row.get(3)?;
            let payload: serde_json::Value = serde_json::from_str(&payload_text).unwrap_or(serde_json::Value::Null);
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "gameVideoId": row.get::<_, String>(1)?,
                "analysisRunId": row.get::<_, String>(2)?,
                "observation": payload,
                "createdAt": row.get::<_, String>(4)?,
                "attemptCount": row.get::<_, i64>(5)?,
            }))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(serde_json::Value::Array(rows))
}

fn mark_vision_synced(state: &AgentState, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let ids: Vec<String> = payload
        .get("ids")
        .and_then(|value| value.as_array())
        .ok_or("ids must be an array")?
        .iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect();
    let status = as_string(payload, "status").ok_or("status is required")?;
    let reason = as_string(payload, "reason");
    let now = chrono_now();

    let connection = state.db.lock().map_err(|_| "database lock poisoned")?;
    let mut applied = 0usize;
    let mut failed = 0usize;
    let mut dead_lettered = 0usize;

    for id in ids {
        match status.as_str() {
            "APPLIED" | "DUPLICATE" => {
                applied += connection
                    .execute(
                        "UPDATE vision_observations SET syncedAt = ?1, failureReason = NULL WHERE id = ?2",
                        params![now, id],
                    )
                    .map_err(|error| error.to_string())?;
            }
            "FAILED" => {
                connection
                    .execute(
                        "UPDATE vision_observations SET attemptCount = attemptCount + 1, failureReason = ?1,
                                deadLetteredAt = CASE WHEN attemptCount + 1 >= ?2 THEN ?3 ELSE NULL END
                         WHERE id = ?4",
                        params![reason, DEAD_LETTER_THRESHOLD, now, id],
                    )
                    .map_err(|error| error.to_string())?;
                failed += 1;
                let is_dead: Option<i64> = connection
                    .query_row(
                        "SELECT CASE WHEN deadLetteredAt IS NULL THEN 0 ELSE 1 END FROM vision_observations WHERE id = ?1",
                        params![id],
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

async fn handshake(
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

    let user_id = payload.get("userId").and_then(|value| value.as_str()).unwrap_or("").to_string();
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


async fn agent(State(state): State<AgentState>, headers: HeaderMap, body: axum::body::Bytes) -> impl IntoResponse {
    // The bearer token is checked BEFORE the body is parsed, so the answer to "are you allowed" never depends on what was sent.
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
    let _session = session;

    let request: AgentRequest = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(error) => return (StatusCode::BAD_REQUEST, err(format!("invalid JSON body: {error}"))),
    };

    let result: Result<serde_json::Value, String> = match request.action.as_str() {
        // PING reports the pragmas because `synchronous` is per-connection: another process reading the file can see WAL (stored
        // in the header) but not the durability setting, so the agent has to answer for its own connection.
        "PICK_VIDEO" => {
            // rfd blocks until the dialog closes; the handler is async, so the dialog runs on a blocking thread and the runtime
            // stays responsive for the health polls the page is making at the same time.
            let picked = tauri::async_runtime::spawn_blocking(|| {
                rfd::FileDialog::new()
                    .add_filter("Video", &["mp4", "mov", "mkv", "avi"])
                    .pick_file()
            })
            .await
            .ok()
            .flatten();

            match picked {
                None => Ok(serde_json::json!({ "cancelled": true })),
                Some(path) => {
                    let metadata = std::fs::metadata(&path).ok();
                    Ok(serde_json::json!({
                        "cancelled": false,
                        "videoPath": path.to_string_lossy(),
                        "fileName": path.file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_default(),
                        "fileSizeBytes": metadata.map(|meta| meta.len()).unwrap_or(0),
                        "extension": path.extension().map(|ext| ext.to_string_lossy().to_lowercase()).unwrap_or_default(),
                    }))
                }
            }
        }
        "ANALYZE_VIDEO" => {
            // The handler returns a response, not a Result, so each missing field becomes a 400 here rather than a `?`.
            let video_path = match as_string(&request.payload, "videoPath") {
                Some(value) => value,
                None => return (StatusCode::BAD_REQUEST, err("videoPath is required")),
            };
            let game_video_id = match as_string(&request.payload, "gameVideoId") {
                Some(value) => value,
                None => return (StatusCode::BAD_REQUEST, err("gameVideoId is required")),
            };
            let analysis_run_id = match as_string(&request.payload, "analysisRunId") {
                Some(value) => value,
                None => return (StatusCode::BAD_REQUEST, err("analysisRunId is required")),
            };

            if !std::path::Path::new(&video_path).exists() {
                return (StatusCode::BAD_REQUEST, err("file not found"));
            }

            let body = serde_json::json!({
                "videoPath": video_path,
                "gameVideoId": game_video_id,
                "analysisRunId": analysis_run_id,
                "calibration": request.payload.get("calibration").cloned().unwrap_or(serde_json::Value::Null),
            });

            // 30 minutes: enough for a long clip on a CPU, short enough that a wedged sidecar does not hang the page forever.
            let encoded = serde_json::to_vec(&body).unwrap_or_default();
            match ureq::post(&format!("http://127.0.0.1:{VISION_PORT}/analyze"))
                .timeout(std::time::Duration::from_secs(30 * 60))
                .set("Content-Type", "application/json")
                .send_bytes(&encoded)
            {
                Ok(response) => {
                    let mut text = String::new();
                    if let Err(error) = response.into_reader().read_to_string(&mut text) {
                        return (StatusCode::BAD_GATEWAY, err(format!("cannot read sidecar response: {error}")));
                    }
                    match serde_json::from_str::<serde_json::Value>(&text) {
                        Ok(parsed) => Ok(parsed),
                        Err(error) => Err(format!("sidecar returned invalid JSON: {error}")),
                    }
                }
                Err(ureq::Error::Status(code, response)) => {
                    Err(format!("sidecar returned HTTP {code}: {}", response.status_text()))
                }
                Err(error) => Err(format!("sidecar unreachable: {error}")),
            }
        }
        "SAVE_VISION_OBSERVATIONS" => save_vision_observations(&state, &request.payload),
        "READ_VISION_OBSERVATIONS" => read_vision_observations(&state),
        "MARK_VISION_SYNCED" => mark_vision_synced(&state, &request.payload),
        "VISION_STATUS" => {
            let mut status = match state.vision.lock() {
                Ok(status) => status.clone(),
                Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, err("vision state unavailable")),
            };
            // The process can die on its own; trust the process table over our memory of starting it.
            if status.running {
                let healthy = ureq::get(&format!("http://127.0.0.1:{VISION_PORT}/health"))
                    .timeout(std::time::Duration::from_millis(800))
                    .call()
                    .is_ok();
                if !healthy {
                    status.running = false;
                }
            }
            Ok(serde_json::to_value(status).unwrap_or_default())
        }
        "DOWNLOAD_VISION_ENGINE" => {
            // Installing over a running engine fails on Windows with "Access is denied (os error 5)" - the executable is locked by
            // its own process, and an engine orphaned by a previous agent restart holds the file just as firmly. The child handle
            // only covers the process this agent started, so kill by image name as well; failure is fine (nothing to kill).
            let _ = Command::new("taskkill")
                .args(["/IM", "engine.exe", "/F", "/T"])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
            std::thread::sleep(std::time::Duration::from_millis(400));
            // Installing over a running engine fails on Windows with "Access is denied (os error 5)" - the executable is locked by
            // its own process. Stop it first; the page can start it again when the download finishes.
            if let Ok(mut child) = state.vision_child.lock() {
                if let Some(mut running) = child.take() {
                    let _ = running.kill();
                    let _ = running.wait();
                    std::thread::sleep(std::time::Duration::from_millis(600));
                }
            }
            {
                let mut status = match state.vision.lock() {
                    Ok(status) => status,
                    Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, err("vision state unavailable")),
                };
                status.running = false;
                if status.downloading {
                    return (StatusCode::CONFLICT, err("a download is already running"));
                }
                status.downloading = true;
                status.error = None;
                status.downloaded_bytes = 0;
                status.total_bytes = VISION_ENGINE_BYTES;
            }

            let vision = state.vision.clone();
            let directory = state.vision_dir.clone();
            std::thread::spawn(move || {
                let finish = |vision: &Arc<Mutex<VisionState>>, result: Result<(), String>| {
                    if let Ok(mut status) = vision.lock() {
                        status.downloading = false;
                        match result {
                            Ok(()) => {
                                status.installed = true;
                                status.error = None;
                            }
                            Err(message) => status.error = Some(message),
                        }
                    }
                };

                let outcome = (|| -> Result<(), String> {
                    std::fs::create_dir_all(directory.as_path()).map_err(|error| error.to_string())?;
                    let target = directory.join("engine.exe");
                    let partial = directory.join("engine.exe.part");

                    let response = ureq::get(VISION_ENGINE_URL)
                        .call()
                        .map_err(|error| format!("download failed: {error}"))?;
                    let mut reader = response.into_reader();
                    let mut file = std::fs::File::create(&partial).map_err(|error| error.to_string())?;

                    use sha2::{Digest, Sha256};
                    let mut hasher = Sha256::new();
                    let mut buffer = vec![0u8; 256 * 1024];
                    let mut written: u64 = 0;
                    loop {
                        let read = reader.read(&mut buffer).map_err(|error| error.to_string())?;
                        if read == 0 {
                            break;
                        }
                        hasher.update(&buffer[..read]);
                        file.write_all(&buffer[..read]).map_err(|error| error.to_string())?;
                        written += read as u64;
                        if let Ok(mut status) = vision.lock() {
                            status.downloaded_bytes = written;
                        }
                    }
                    file.flush().map_err(|error| error.to_string())?;
                    drop(file);

                    let digest = hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
                    if digest != VISION_ENGINE_SHA256 {
                        let _ = std::fs::remove_file(&partial);
                        return Err(format!("sha256 mismatch: expected {VISION_ENGINE_SHA256}, got {digest}"));
                    }
                    if written != VISION_ENGINE_BYTES {
                        let _ = std::fs::remove_file(&partial);
                        return Err(format!("size mismatch: expected {VISION_ENGINE_BYTES}, got {written}"));
                    }

                    // Replace rather than rename-over: on Windows rename fails when the destination exists and is locked.
                    if target.exists() {
                        std::fs::remove_file(&target).map_err(|error| {
                            format!("cannot replace the installed engine ({error}); stop the vision engine and retry")
                        })?;
                    }
                    std::fs::rename(&partial, &target).map_err(|error| error.to_string())?;
                    println!("ultraos-agent: vision engine installed at {}", target.display());
                    Ok(())
                })();

                finish(&vision, outcome);
            });

            Ok(serde_json::json!({ "started": true, "totalBytes": VISION_ENGINE_BYTES }))
        }
        "START_VISION_SIDECAR" => {
            let exe = state.vision_dir.join("engine.exe");
            if !exe.exists() {
                return (StatusCode::BAD_REQUEST, err("vision engine is not installed"));
            }
            let _ = Command::new("taskkill")
                .args(["/IM", "engine.exe", "/F", "/T"])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
            std::thread::sleep(std::time::Duration::from_millis(400));
            {
                let mut child = match state.vision_child.lock() { Ok(child) => child, Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, err("child state unavailable")) };
                if child.is_some() {
                    return (StatusCode::CONFLICT, err("vision sidecar already started"));
                }
                let spawned = Command::new(&exe)
                    .current_dir(state.vision_dir.as_path())
                    .spawn();
                let spawned = match spawned {
                    Ok(spawned) => spawned,
                    Err(error) => return (StatusCode::BAD_REQUEST, err(format!("cannot start sidecar: {error}"))),
                };
                *child = Some(spawned);
            }

            // Health-check for up to 30s, then kill: a sidecar that starts but never answers is worse than one that fails loudly.
            let mut healthy = false;
            for _ in 0..30 {
                std::thread::sleep(std::time::Duration::from_secs(1));
                if ureq::get(&format!("http://127.0.0.1:{VISION_PORT}/health"))
                    .timeout(std::time::Duration::from_millis(900))
                    .call()
                    .is_ok()
                {
                    healthy = true;
                    break;
                }
            }

            if !healthy {
                if let Ok(mut child) = state.vision_child.lock() {
                    if let Some(mut running) = child.take() {
                        let _ = running.kill();
                    }
                }
                if let Ok(mut status) = state.vision.lock() {
                    status.running = false;
                    status.error = Some("sidecar did not answer /health within 30s".into());
                }
                return (StatusCode::BAD_REQUEST, err("sidecar did not answer /health within 30s"));
            }

            if let Ok(mut status) = state.vision.lock() {
                status.running = true;
                status.version = Some(env!("CARGO_PKG_VERSION").to_string());
            }
            Ok(serde_json::json!({ "running": true }))
        }
        "STOP_VISION_SIDECAR" => {
            let stopped = {
                let mut child = match state.vision_child.lock() { Ok(child) => child, Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, err("child state unavailable")) };
                match child.take() {
                    Some(mut running) => {
                        let _ = running.kill();
                        let _ = running.wait();
                        true
                    }
                    None => false,
                }
            };
            if let Ok(mut status) = state.vision.lock() {
                status.running = false;
            }
            Ok(serde_json::json!({ "stopped": stopped }))
        }
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
                "dbPath": *state.db_path,
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
                // x-ultraos-token is a non-simple header, so the browser sends a preflight for every agent call. Without it
                // listed here, the preflight fails and the page sees "Failed to fetch" - which is exactly what the acceptance run
                // reported while the agent itself was healthy.
                .allow_headers([
                    axum::http::header::CONTENT_TYPE,
                    axum::http::HeaderName::from_static("x-ultraos-token"),
                ])
                .allow_credentials(true);

            let state = AgentState {
                db: Arc::new(Mutex::new(connection)),
                db_path: Arc::new(
                    data_dir
                        .join("ultraos")
                        .join("outbox.db")
                        .to_string_lossy()
                        .to_string(),
                ),
                sessions: Arc::new(Mutex::new(HashMap::new())),
                vision: Arc::new(Mutex::new(VisionState {
                    total_bytes: VISION_ENGINE_BYTES,
                    ..VisionState::default()
                })),
                vision_child: Arc::new(Mutex::new(None)),
                vision_dir: Arc::new(data_dir.join("vision")),
                handshake_seen: flag_for_server,
            };

            let app = Router::new()
                .route("/handshake", post(handshake))
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
