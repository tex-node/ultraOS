"""Trust the origin the window is actually pointed at.

`ULTRAOS_APP_URL` exists so the shell can be aimed at staging (or an SSH tunnel) for an acceptance run. A CORS allow-list that
still names only production would reject the very page the window just loaded - the agent would answer 403 to its own app.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "desktop/src-tauri/src/lib.rs"
source = LIB.read_text(encoding="utf-8")

if "fn origin_of(" in source:
    print("origins already derived from the app URL")
    raise SystemExit(0)

source = source.replace(
    'const ALLOWED_ORIGINS: [&str; 2] = ["https://app.neonultra.ng", "http://localhost:3000"];',
    '''const ALLOWED_ORIGINS: [&str; 2] = ["https://app.neonultra.ng", "http://localhost:3000"];

/// The origin the agent should also trust: whatever the window is actually pointed at. Without this, pointing the shell at
/// staging blocks the agent on our own CORS rule, and the failure looks like "the desktop app cannot see its agent".
fn origin_of(url: &str) -> Option<String> {
    let parts: Vec<&str> = url.splitn(4, '/').collect();
    if parts.len() >= 3 && !parts[2].is_empty() {
        Some(format!("{}//{}", parts[0], parts[2]))
    } else {
        None
    }
}''',
)

source = source.replace(
    "fn spawn_agent(data_dir: PathBuf) -> Arc<std::sync::atomic::AtomicBool> {",
    "fn spawn_agent(data_dir: PathBuf, app_url: String) -> Arc<std::sync::atomic::AtomicBool> {",
)

source = source.replace(
    """            let origins: Vec<HeaderValue> = ALLOWED_ORIGINS
                .iter()
                .filter_map(|origin| HeaderValue::from_str(origin).ok())
                .collect();""",
    """            let mut origin_strings: Vec<String> = ALLOWED_ORIGINS.iter().map(|origin| origin.to_string()).collect();
            if let Some(origin) = origin_of(&app_url) {
                if !origin_strings.contains(&origin) {
                    origin_strings.push(origin);
                }
            }
            let origins: Vec<HeaderValue> = origin_strings
                .iter()
                .filter_map(|origin| HeaderValue::from_str(origin).ok())
                .collect();""",
)

source = source.replace(
    "let handshake_seen = spawn_agent(data_dir);",
    "let handshake_seen = spawn_agent(data_dir, app_url.clone());",
)

LIB.write_text(source, encoding="utf-8", newline="\n")
print("agent origins now follow ULTRAOS_APP_URL")
