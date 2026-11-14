"""Native picker + analyze bridge (Prompt 5c-v).

The page never sees the bytes. `PICK_VIDEO` opens a native dialog in the agent and returns a path; `ANALYZE_VIDEO` posts that path to
the sidecar on 127.0.0.1:8011 and returns the observations. Both processes are local; the webview only orchestrates, which is the
entire reason this runs as a desktop app rather than a browser tab.

Long timeout on /analyze on purpose: a 30-minute game on a CPU is hours of inference, and a 30-second client timeout would report
"failed" for work that is still running.
"""
import pathlib

p = pathlib.Path("desktop/src-tauri/src/lib.rs")
s = p.read_text(encoding="utf-8")

if "PICK_VIDEO" in s:
    print("picker already present")
    raise SystemExit(0)

s = s.replace(
    '        "SAVE_VISION_OBSERVATIONS" => save_vision_observations(&state, &request.payload),',
    '''        "PICK_VIDEO" => {
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
            let video_path = as_string(&request.payload, "videoPath").ok_or("videoPath is required")?;
            let game_video_id = as_string(&request.payload, "gameVideoId").ok_or("gameVideoId is required")?;
            let analysis_run_id = as_string(&request.payload, "analysisRunId").ok_or("analysisRunId is required")?;

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
            match ureq::post(&format!("http://127.0.0.1:{VISION_PORT}/analyze"))
                .timeout(std::time::Duration::from_secs(30 * 60))
                .send_json(body)
            {
                Ok(response) => {
                    let parsed: serde_json::Value = response
                        .into_json()
                        .map_err(|error| format!("sidecar returned invalid JSON: {error}"))?;
                    Ok(parsed)
                }
                Err(ureq::Error::Status(code, response)) => {
                    Err(format!("sidecar returned HTTP {code}: {}", response.status_text()))
                }
                Err(error) => Err(format!("sidecar unreachable: {error}")),
            }
        }
        "SAVE_VISION_OBSERVATIONS" => save_vision_observations(&state, &request.payload),''',
)

p.write_text(s, encoding="utf-8", newline="\n")
print("PICK_VIDEO and ANALYZE_VIDEO added")
