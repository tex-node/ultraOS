"""Vision downloader and supervisor in the agent (Prompt 5c-iii).

The agent gains four actions and one piece of state:

  DOWNLOAD_VISION_ENGINE  streams the hosted exe to <appdata>/vision/engine.exe, hashing as it goes, and refuses to install it unless
                          the SHA256 matches the pin. The download runs on its own thread so the page can poll instead of holding a
                          request open for six minutes.
  START_VISION_SIDECAR    spawns the exe and waits for 127.0.0.1:8011/health, killing it again if it never answers.
  STOP_VISION_SIDECAR     terminates the child.
  VISION_STATUS           installed / running / version / progress bytes.

The hash is checked against a constant rather than trusting what arrived: a downloader that installs whatever the URL returns is a
remote-code-execution path with a progress bar.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "desktop/src-tauri/src/lib.rs"
CARGO = ROOT / "desktop/src-tauri/Cargo.toml"
source = LIB.read_text(encoding="utf-8")

if "DOWNLOAD_VISION_ENGINE" in source:
    print("vision actions already present")
    raise SystemExit(0)

cargo = CARGO.read_text(encoding="utf-8")
if "ureq" not in cargo:
    cargo = cargo.replace('sha2 = "0.10"', 'sha2 = "0.10"\nureq = { version = "2", features = ["tls"] }')
    CARGO.write_text(cargo, encoding="utf-8", newline="\n")

# --- imports -----------------------------------------------------------------------------------------------------------------
source = source.replace(
    "use std::collections::HashMap;",
    "use std::collections::HashMap;\nuse std::io::{Read, Write};\nuse std::process::{Child, Command};\nuse std::sync::atomic::{AtomicBool, Ordering};",
)

# --- constants ---------------------------------------------------------------------------------------------------------------
source = source.replace(
    "const AGENT_TOKEN_TTL_SECONDS: i64 = 300;",
    '''const AGENT_TOKEN_TTL_SECONDS: i64 = 300;

/// The published sidecar. Pinned by hash: the downloader installs this bytes-for-bytes or nothing.
const VISION_ENGINE_URL: &str =
    "https://pub-e130aa56d5b242f68e0574ce9e065d59.r2.dev/apps/ultraos-vision-engine.exe";
const VISION_ENGINE_SHA256: &str = "193d2a8f3a84c7a5d9e5d5181ca9cd9f819e0f727cf1277176aa9449632ca5ba";
const VISION_ENGINE_BYTES: u64 = 261_157_478;
const VISION_PORT: u16 = 8011;''',
)

# --- state -------------------------------------------------------------------------------------------------------------------
source = source.replace(
    "#[derive(Clone)]\nstruct AgentState {",
    '''/// Everything the vision tab needs to render. One struct, because the page polls one action.
#[derive(Clone, Default)]
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
struct AgentState {''',
)

source = source.replace(
    "    sessions: Arc<Mutex<HashMap<String, AgentSession>>>,",
    """    sessions: Arc<Mutex<HashMap<String, AgentSession>>>,
    vision: Arc<Mutex<VisionState>>,
    vision_child: Arc<Mutex<Option<Child>>>,
    vision_dir: Arc<std::path::PathBuf>,""",
)

# --- actions -----------------------------------------------------------------------------------------------------------------
source = source.replace(
    '        "PING" => {',
    '''        "VISION_STATUS" => {
            let mut status = state.vision.lock().map_err(|_| "vision state unavailable")?.clone();
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
            {
                let mut status = state.vision.lock().map_err(|_| "vision state unavailable")?;
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
            {
                let mut child = state.vision_child.lock().map_err(|_| "child state unavailable")?;
                if child.is_some() {
                    return (StatusCode::CONFLICT, err("vision sidecar already started"));
                }
                let spawned = Command::new(&exe)
                    .current_dir(state.vision_dir.as_path())
                    .spawn()
                    .map_err(|error| format!("cannot start sidecar: {error}"))?;
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
                let mut child = state.vision_child.lock().map_err(|_| "child state unavailable")?;
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
        "PING" => {''',
)

# --- state construction ------------------------------------------------------------------------------------------------------
source = source.replace(
    """                sessions: Arc::new(Mutex::new(HashMap::new())),
                handshake_seen: flag_for_server,""",
    """                sessions: Arc::new(Mutex::new(HashMap::new())),
                vision: Arc::new(Mutex::new(VisionState {
                    total_bytes: VISION_ENGINE_BYTES,
                    ..VisionState::default()
                })),
                vision_child: Arc::new(Mutex::new(None)),
                vision_dir: Arc::new(data_dir.join("vision")),
                handshake_seen: flag_for_server,""",
)

LIB.write_text(source, encoding="utf-8", newline="\n")
print("vision actions added to the agent")
