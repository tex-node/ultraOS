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

## The local agent (Prompt 3)

The shell now runs an HTTP agent on **127.0.0.1:8012**. It is the only privileged surface the page can reach, and it is deliberately
small: four actions, a bearer token delivered as an `HttpOnly` cookie, and CORS pinned to the two origins we control.

| Route | Purpose |
| --- | --- |
| `GET /handshake` | sets `ultraos_agent=<uuid>` (`HttpOnly; SameSite=None; Secure`) and returns 200 |
| `GET /offline` | the "cannot reach UltraOS" page, served by the agent (see below) |
| `POST /api/local/agent` | `PING` · `SAVE_OUTBOX` · `READ_OUTBOX` · `CLEAR_OUTBOX` |

`SAVE_OUTBOX` appends to `outbox.json` in the app data directory (write-then-rename, so a power cut cannot leave a half-written
queue). Prompt 4 replaces the file with SQLite behind the same four actions.

### Verified

```
handshake            200, token 36 chars, HttpOnly + SameSite=None + Secure
no cookie, bad body  401  (the token is checked BEFORE the body is parsed, so a stranger learns nothing)
PING                 200 {"status":"ok","version":"0.1.0","store":"json"}
SAVE_OUTBOX          200 {"saved":2,"pending":2}
READ_OUTBOX          200 [ …two records… ]
CLEAR_OUTBOX         200 {"cleared":true} → READ returns []
unknown action       400 unsupported action
CORS allowed origin  access-control-allow-origin: https://app.neonultra.ng · allow-credentials: true
CORS foreign origin  no allow-origin header → blocked
```

### The offline page is served, not embedded

The first attempt navigated to a `data:text/html;base64,…` URL. WebView2 renders data: documents inconsistently and the window came
up as a near-black rectangle - the exact failure the page exists to prevent. The agent now serves it at `/offline`, and the watchdog
navigates there when the page has not completed a handshake within 12 seconds:

```
ultraos-shell: no handshake from the app; showing the offline page
ultraos-shell: loaded http://127.0.0.1:8012/offline
```

That log line is the proof: WebView2 fires `PageLoadEvent::Finished` for the agent's page, so the window is showing it. Note that
`capture-window.ps1` photographs it as black - `PrintWindow` cannot composite WebView2's GPU surface for that document, which is
also why the earlier black screenshots were an artefact rather than a rendering bug.

### Why the page only probes when it is inside the shell

`detectLocalAgent()` returns early unless the user agent contains `UltraOSDesktop` (the shell sets it). Without that gate the badge
fired a loopback request on every render, which the sync-status test counted as a sync attempt and failed - correctly. The gate is
honest: a plain browser has no agent, so it should not knock on a port that will not answer.
