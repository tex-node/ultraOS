"""Vision observation queue in the agent (Prompt 5c-iv Action 1).

A second table next to the scoring outbox, with the same retry semantics: idempotent insert by observation id, per-id marking, and
dead-lettering at five attempts. The scoring outbox already proved this shape; duplicating its rules here rather than inventing new
ones is the point.
"""
import pathlib

p = pathlib.Path("desktop/src-tauri/src/lib.rs")
s = p.read_text(encoding="utf-8")

if "SAVE_VISION_OBSERVATIONS" in s:
    print("vision queue already present")
    raise SystemExit(0)

# --- schema -------------------------------------------------------------------------------------------------------------------
s = s.replace(
    """        CREATE INDEX IF NOT EXISTS idx_pending ON outbox(syncedAt, deadLetteredAt);
        \"#,""",
    """        CREATE INDEX IF NOT EXISTS idx_pending ON outbox(syncedAt, deadLetteredAt);

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
        \"#,""",
)

# --- helpers ------------------------------------------------------------------------------------------------------------------
s = s.replace(
    "fn read_outbox(state: &AgentState) -> Result<serde_json::Value, String> {",
    '''/// Insert one row per observation. `INSERT OR IGNORE` on the observation id: replaying a batch - the page retrying, the sidecar
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

fn read_outbox(state: &AgentState) -> Result<serde_json::Value, String> {''',
)

# --- dispatch -----------------------------------------------------------------------------------------------------------------
s = s.replace(
    '        "VISION_STATUS" => {',
    '''        "SAVE_VISION_OBSERVATIONS" => save_vision_observations(&state, &request.payload),
        "READ_VISION_OBSERVATIONS" => read_vision_observations(&state),
        "MARK_VISION_SYNCED" => mark_vision_synced(&state, &request.payload),
        "VISION_STATUS" => {''',
)

p.write_text(s, encoding="utf-8", newline="\n")
print("vision observation queue added")
