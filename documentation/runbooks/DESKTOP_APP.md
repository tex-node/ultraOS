# Desktop app (UltraOS Scoring) — build and run

A Tauri 2 shell around the hosted app. It exists for two things a browser tab cannot do: durable offline storage on the venue
laptop, and running the vision worker locally. The reasoning behind that shape — and the option it rejected — is in
[`documentation/architecture/DESKTOP_APP.md`](../architecture/DESKTOP_APP.md).

**Current state:** Prompt 2 of the streak. The window, the native menu and the remote webview work. The local agent (Prompt 3),
SQLite outbox (Prompt 4) and vision downloader (Prompt 5) are not built yet.

---

## Run it

```bash
cd desktop
npm install              # once: installs @tauri-apps/cli
npm run dev              # cargo build + launch the window
```

From the repo root:

```bash
npm run desktop:dev      # same thing
npm run desktop:check    # cargo check only — no window
npm run desktop:build    # NSIS + MSI installers into the cargo target dir
```

**Prerequisites:** Rust 1.77+ (`rustup`), the Visual Studio C++ build tools for the Windows target, and WebView2 (shipped with
Windows 11; the installer carries the bootstrapper for Windows 10).

## What the window is

| Setting | Value | Why |
| --- | --- | --- |
| load URL | `https://app.neonultra.ng` | the desktop app is the hosted app, not a copy of it |
| `withGlobalTauri` | `false` | the page is a **remote** origin; exposing Tauri IPC to it would hand filesystem and process access to any injected script |
| window | 1366×900, min 1024×768 | 1024×768 is the smallest tablet the scoring console supports |
| menu | File → Exit, Help → About | a window with no menu reads as a kiosk |

There is no address bar and no browser chrome: that is the point.

## Verified on this machine

```
cargo build           Finished `dev` profile in 6m 28s
launch                window title "UltraOS Scoring", 30 MB resident
webview               renders https://app.neonultra.ng (Events / Clubs / Fixtures / … / Host a tournament)
quit                  File → Exit closes the process cleanly
```

The launch check is a screenshot of the window itself, taken with `PrintWindow` + `PW_RENDERFULLCONTENT`
(`desktop/capture-window.ps1`). A plain screen grab would capture the whole desktop; this captures only our window, which is both
more useful and less invasive.

## Two things that will waste your afternoon

1. **`CARGO_TARGET_DIR` may be set globally.** On this workstation it points at `C:\Users\XPS\apex-court-target`, so the binary
   lands there (`…\debug\ultraos-desktop.exe`) and *not* in `desktop/src-tauri/target`. If `cargo build` says "Finished" and
   there is no `target/`, that is why. Run `cargo metadata --no-deps | findstr target_directory` to find it.
2. **The window renders the deployed site, so a deploy is a new desktop build.** The shell loads the URL live; there is no
   bundled copy to get stale, and equally no offline fallback if the URL is down. That trade-off is deliberate (Option B) and is
   the first thing to revisit if venues report "the app opens to a blank page".

## Next steps, in order

| Step | What it adds | Proof |
| --- | --- | --- |
| 3 — local agent | Axum listener on `127.0.0.1:8012`, token + allow-list (`PING`, `SAVE_OUTBOX`, `READ_OUTBOX`, `CLEAR_OUTBOX`) | `curl` against the port with and without the token |
| 4 — SQLite outbox | repository switches to the agent when `window.__ULTRAOS_DESKTOP__` is present | score offline → rows in the `.db` → sync → staging |
| 5 — vision downloader | optional engine download, sidecar supervised on `127.0.0.1:8011` | download, then analyse a clip with the network off |
