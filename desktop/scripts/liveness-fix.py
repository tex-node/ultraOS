"""Liveness is "the app origin answered", not "the page completed a handshake".

The watchdog replaced the window with the offline page after 12 seconds without a handshake. That is right when the site is unreachable
and wrong in two ordinary cases:

  * the login screen - nobody has signed in, so nothing calls /handshake yet;
  * any page that does not mount the capture console.

The distinction that matters is whether a document from the app origin finished loading. If it did, the connection is fine and the
window must be left alone. If it did not, the user needs to be told why.

A global for the flag is deliberate: the page-load hook is registered on the builder, outside the state the agent owns.
"""
import pathlib

p = pathlib.Path("desktop/src-tauri/src/lib.rs")
s = p.read_text(encoding="utf-8")

if "APP_ORIGIN_LOADED" in s:
    print("already patched")
    raise SystemExit(0)

s = s.replace(
    "const VISION_PORT: u16 = 8011;",
    '''const VISION_PORT: u16 = 8011;

/// Set when a document from the app origin finishes loading. See the comment on the watchdog: a handshake is not required to prove
/// the app is alive, and requiring one shows "cannot connect" to a working login screen.
static APP_ORIGIN_LOADED: AtomicBool = AtomicBool::new(false);''',
)

s = s.replace(
    """                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(12));
                    if handshake_seen.load(std::sync::atomic::Ordering::SeqCst) {
                        return;
                    }""",
    """                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(12));
                    if handshake_seen.load(std::sync::atomic::Ordering::SeqCst)
                        || APP_ORIGIN_LOADED.load(std::sync::atomic::Ordering::SeqCst)
                    {
                        return;
                    }""",
)

s = s.replace(
    """        .on_page_load(|_window, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                println!("ultraos-shell: loaded {}", payload.url());
            }
        })""",
    """        .on_page_load(|_window, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let url = payload.url();
                println!("ultraos-shell: loaded {url}");
                // Any document from the app origin counts as liveness, whether or not the page has signed in or mounted a console.
                let expected = std::env::var("ULTRAOS_APP_URL").unwrap_or_else(|_| DEFAULT_APP_URL.to_string());
                if let (Some(scheme_host), Some(expected_host)) = (origin_of(&url), origin_of(&expected)) {
                    if scheme_host == expected_host {
                        APP_ORIGIN_LOADED.store(true, std::sync::atomic::Ordering::SeqCst);
                    }
                }
            }
        })""",
)

p.write_text(s, encoding="utf-8", newline="\n")
print("watchdog now treats a loaded app document as liveness")
