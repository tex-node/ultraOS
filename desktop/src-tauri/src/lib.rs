// UltraOS Scoring — desktop shell library.
//
// The shell lives in `lib.rs` because Windows needs a `cdylib` for the mobile/desktop bundler and Cargo resolves the `[lib]`
// target to `src/lib.rs`. `main.rs` is the thin binary that calls `run()`.
//
// Two security decisions are visible right here:
//
//   * `withGlobalTauri` is false in tauri.conf.json, so `window.__TAURI__` does not exist in the webview. The page is a REMOTE
//     origin; if it could reach Tauri's IPC, any script injected into it would inherit filesystem and process access. The agent
//     (Prompt 3) exposes a fixed command allow-list over 127.0.0.1 instead, which keeps that surface out of the browser.
//   * no capability grants IPC permissions to the remote origin. A window that can only render is a window that can only be a
//     window.

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // A tiny native menu: File -> Exit, Help -> About. A desktop window with no menu reads as a kiosk, and "how do I
            // quit this" should not be Alt+F4 trivia.
            let exit = MenuItemBuilder::with_id("exit", "Exit").build(app)?;
            let about = MenuItemBuilder::with_id("about", "About UltraOS Scoring").build(app)?;

            let file = SubmenuBuilder::new(app, "File").item(&exit).build()?;
            let help = SubmenuBuilder::new(app, "Help").item(&about).build()?;

            let menu = MenuBuilder::new(app).item(&file).item(&help).build()?;
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "exit" => app.exit(0),
            "about" => {
                // Short on purpose: it lands in a native dialog on a laptop someone is holding courtside.
                println!("UltraOS Scoring {}", env!("CARGO_PKG_VERSION"));
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running UltraOS Scoring");
}
