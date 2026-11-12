"""Replace the URL heuristic with a liveness signal for the offline fallback.

The first version compared the webview's URL to the app URL after a delay. That cannot work: WebView2 shows its own error page AT
the requested URL, so `url().starts_with(app_url)` is true for a failed load and the fallback never appears (verified by launching
with ULTRAOS_APP_URL=http://127.0.0.1:9/ and capturing the window - it showed Chromium's "can't reach this page").

The signal that actually means "the app is alive" is the app talking to us: the page calls /handshake as soon as it loads. If the
agent has seen no handshake 12 seconds after launch, nothing loaded, whatever the address bar says.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "desktop/src-tauri/src/lib.rs"
source = LIB.read_text(encoding="utf-8")

# 1. state gains the flag
source = source.replace(
    """struct AgentState {
    token: Arc<String>,
    data_dir: Arc<PathBuf>,
}""",
    """struct AgentState {
    token: Arc<String>,
    data_dir: Arc<PathBuf>,
    /// Set the moment the page completes its first handshake - the only reliable evidence that the remote app actually loaded.
    handshake_seen: Arc<std::sync::atomic::AtomicBool>,
}""",
)

# 2. handshake records it
source = source.replace(
    """async fn handshake(State(state): State<AgentState>) -> impl IntoResponse {
    // SameSite=None""",
    """async fn handshake(State(state): State<AgentState>) -> impl IntoResponse {
    state
        .handshake_seen
        .store(true, std::sync::atomic::Ordering::SeqCst);

    // SameSite=None""",
)

# 3. spawn_agent hands the flag back to the caller
source = source.replace(
    "fn spawn_agent(data_dir: PathBuf) {",
    "fn spawn_agent(data_dir: PathBuf) -> Arc<std::sync::atomic::AtomicBool> {\n    let handshake_seen = Arc::new(std::sync::atomic::AtomicBool::new(false));\n    let flag_for_server = handshake_seen.clone();",
)
source = source.replace(
    "let state = AgentState { token: Arc::new(uuid::Uuid::new_v4().to_string()), data_dir: Arc::new(data_dir) };",
    """let state = AgentState {
                token: Arc::new(uuid::Uuid::new_v4().to_string()),
                data_dir: Arc::new(data_dir),
                handshake_seen: flag_for_server,
            };""",
)
source = source.replace(
    """            let _ = axum::serve(listener, app).await;
        });
    });
}""",
    """            let _ = axum::serve(listener, app).await;
        });
    });

    handshake_seen
}""",
)

# 4. setup: keep the flag, and replace the URL-based watchdog
source = source.replace("spawn_agent(data_dir);", "let handshake_seen = spawn_agent(data_dir);")

old_watchdog_start = source.find("                let fallback = offline_fallback_html(&app_url);")
old_watchdog_end = source.find("                Ok(())", old_watchdog_start)
if old_watchdog_start == -1 or old_watchdog_end == -1:
    raise SystemExit("watchdog block not found")

new_watchdog = """                let fallback = offline_fallback_html(&app_url);
                let window_for_check = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(12));
                    if handshake_seen.load(std::sync::atomic::Ordering::SeqCst) {
                        return;
                    }
                    // No handshake after 12s: the page never became the app (offline, DNS failure, captive portal, or the site is
                    // down). Showing WebView2's own error page leaves the user with no idea what to do about it.
                    println!("ultraos-shell: no handshake from the app; showing the offline page");
                    if let Ok(url) = fallback.parse() {
                        let _ = window_for_check.navigate(url);
                    }
                });

"""
source = source[:old_watchdog_start] + new_watchdog + source[old_watchdog_end:]

LIB.write_text(source, encoding="utf-8", newline="\n")
print("fallback now driven by the handshake signal")
