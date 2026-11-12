"""Serve the offline page from the agent itself instead of a data: URL.

Why: `data:text/html;base64,…` navigated, but the window rendered as a near-black rectangle - WebView2 is restrictive about data:
URLs as top-level documents, and a blank page with no explanation is the exact failure this page exists to prevent.

The agent is already listening on 127.0.0.1:8012, so it can serve the page at `/offline`. That gives us a normal HTTP document
with normal rendering, no encoding step, and a natural Retry control (the page links back to the app URL).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "desktop/src-tauri/src/lib.rs"
source = LIB.read_text(encoding="utf-8")

# 1. the builder becomes plain HTML (no data URL), parameterised by the app URL
start = source.find("fn offline_fallback_html(app_url: &str) -> String {")
end = source.find("\n}\n", start) + 3
if start == -1:
    raise SystemExit("fallback builder not found")

builder = '''/// The page shown when the hosted app cannot be reached. Served by the agent at /offline, not as a data: URL: WebView2 renders
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
'''
source = source[:start] + builder + source[end:]

# 2. serve it from the agent
source = source.replace(
    '                .route("/handshake", get(handshake))',
    '                .route("/handshake", get(handshake))\n                .route("/offline", get(offline_page))',
)

# 3. the handler
source = source.replace(
    "async fn handshake(State(state): State<AgentState>) -> impl IntoResponse {",
    '''/// The offline page, served by the agent so the webview loads a normal document.
async fn offline_page() -> impl IntoResponse {
    let app_url = std::env::var("ULTRAOS_APP_URL").unwrap_or_else(|_| DEFAULT_APP_URL.to_string());
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
        offline_fallback_html(&app_url),
    )
}

async fn handshake(State(state): State<AgentState>) -> impl IntoResponse {''',
)

# 4. the watchdog navigates to the agent's page
source = source.replace(
    '                    if let Ok(url) = fallback.parse() {',
    '                    let offline_url = format!("http://127.0.0.1:{AGENT_PORT}/offline");\n                    if let Ok(url) = offline_url.parse() {',
)

LIB.write_text(source, encoding="utf-8", newline="\n")
print("offline page is now served by the agent")
