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

## SQLite outbox and agent-authoritative drain (Prompt 4)

The agent now owns the queue. `outbox.json` is gone; the records live in SQLite at
`%APPDATA%\ng.neonultra.scoring\ultraos\outbox.db`, opened with **WAL** and `synchronous=NORMAL`.

| Action | Behaviour |
| --- | --- |
| `SAVE_OUTBOX` | `INSERT OR IGNORE` — `UNIQUE(idempotencyKey)` makes a duplicate POST a no-op |
| `READ_OUTBOX` | pending rows only (`syncedAt IS NULL AND deadLetteredAt IS NULL`), ordered by `clientUpdatedAt` |
| `MARK_SYNCED` | per key: `APPLIED`/`DUPLICATE` → `syncedAt`; `FAILED`/`CONFLICT` → `attemptCount+1`, dead-lettered at 5 |
| `RETRY_DEAD_LETTERED` | resets every dead-lettered row (mirrors the browser's manual retry) |
| `CLEAR_OUTBOX` | kept as an admin escape hatch for local testing; no production path calls it |

### Verified against the real database file

```
pragmas (agent's connection)  {'journal_mode': 'wal', 'synchronous': 1}
SAVE_OUTBOX x3 (2 unique)     {'received': 3, 'saved': 2, 'pending': 2}
  sqlite                      ('k-1', 0, None) · ('k-2', 0, None)
MARK_SYNCED k-1 APPLIED       {'applied': 1}
  sqlite                      ('k-1', 1, 0, None) · ('k-2', 0, 0, None)
READ_OUTBOX                   one record (k-2)
MARK_SYNCED k-2 FAILED x5     ('k-2', 5, 'signature mismatch', 1) · pending: []
RETRY_DEAD_LETTERED           {'retried': 1} → both rows reset, pending again
unknown action                400 unsupported action
```

Note on `synchronous`: it is **per connection**. A second process opening the file can confirm WAL (stored in the header) but not
the durability setting, so `PING` reports both pragmas from the agent's own connection.

## Acceptance test — score offline, sync, verify (run by hand on Windows)

This is the workflow the desktop app exists for. It talks to **production**, so it is a deliberate, supervised test rather than
something a build pipeline runs.

1. Launch the desktop app and sign in.
2. Open a live fixture's scoring console.
3. Disconnect the network (`ipconfig /release`, or turn wifi off).
4. Score five events: 2PT, 3PT, FT, a substitution, a timeout.
5. In PowerShell, check the local queue:

   ```powershell
   python -c "import sqlite3,os; db=os.path.join(os.environ['APPDATA'],'ng.neonultra.scoring','ultraos','outbox.db'); print(list(sqlite3.connect(db).execute('SELECT idempotencyKey, entityType, attemptCount, syncedAt FROM outbox')))"
   ```

   Expect five rows, `syncedAt` all `None`, `attemptCount` 0.
6. Reconnect, wait for the badge to sync (or click it).
7. Re-run the query. Expect five rows with `syncedAt` set.
8. On the server, count the replayed events:

   ```bash
   sudo docker exec -i ultraos-postgres psql -U ultraos -d ultraleagueos -c "SELECT COUNT(*) FROM \"GameEvent\" WHERE \"gameId\" = '<game-id>';"
   ```

**Status: not yet run.** It needs a hand on the machine and a production fixture; every step above is the operator's, and the
agent side of it is verified separately (the table above). Do not mark this green until the two SQL outputs match.

## Acceptance run: attempted, not passed (2026-11-12)

An attempt was made to drive the loop end to end through WebView2's DevTools protocol, pointed at **staging** (production was not
used: there are no production SUPER_ADMIN credentials available to this agent, and scoring a real fixture is not something to do
without them).

What worked:

```
shell → staging via SSH tunnel    loaded http://127.0.0.1:4120/
CDP attach                        Edg/157.0.4341.46, target = the app page
sign-in as the e2e admin          session established inside the WebView2 profile
capture console                   /games/<fixture>/live rendered, home score 1
user agent                       "UltraOSDesktop/1.0 (UltraOS Scoring)" — the agent gate works
agent reachable from the page     GET http://127.0.0.1:8012/handshake → 200
```

What did not: **five clicks on the console's "Goal" button produced no queue rows** — no `SAVE_OUTBOX` reached the agent and no
confirmation appeared in the UI. The console records a score against a *player*, not a side, so a bare "Goal" click does not
commit an event; the automation never selected a player, so nothing was ever enqueued. That is a limitation of the harness, not
evidence about the app.

Two findings worth keeping:

1. **CDP's `Network.emulateNetworkConditions({offline:true})` is the wrong tool for this test.** It cuts loopback too, so the local
   agent becomes unreachable and the queue stays empty for a reason that cannot happen at a venue. The honest simulation is
   `navigator.onLine = false` plus aborting requests to the app origin, leaving `127.0.0.1:8012` alone.
2. **`ULTRAOS_APP_URL` now also drives the agent's CORS allow-list** (`origin_of`), so pointing the shell at staging no longer
   blocks it against our own rule.

The acceptance section above stays **Status: not yet run**. It needs a human at the keyboard selecting a player and tapping
through the real console; the agent-side half of the path is verified separately and does not depend on this test.

## The console's interaction model (what an automation must do)

Read from `(capture)/games/[fixtureId]/live/page.tsx`, `live-score-capture.tsx`, `sport-capture-panel.tsx` and
`lib/sports/capture-plan.ts`.

### 1. What is on a football console

- **Scoreline**: two `<p class="mt-1 text-5xl font-black sm:text-6xl">` (home first). This is the locator the scoring spec uses.
- **Clock controls**: `Pause`, `Next period`, `Undo last event`, `Confirm final` — all `min-h-[56px]`.
- **A per-team stat form**: `<select name="playerId" required>` plus six buttons (`REBOUND`, `ASSIST`, `STEAL`, `BLOCK`,
  `TURNOVER`, `FOUL`) submitting `recordStatEvent`, a note field, and foul sub-selects.
- **A "Sport capture · Football" catalog panel**: one form per team with `<select name="playerId">` (**not** required) and buttons
  named by catalog key — `GOAL`, `OWN_GOAL`, `CORNER`, `OFFSIDE`, `FOUL`, `YELLOW_CARD`, `RED_CARD`, `SUBSTITUTION` — each a submit
  button with `name="typeKey"`, plus an optional note input.
- **No `+1 / +2 / +3`**: those come from `LiveScoreCapture`, which renders only when the sport has a scoring module
  (`resolveScoringModule`) or is basketball.

### 2. Does a Goal require a player first?

No — neither path requires one:

- The catalog `GOAL` submit has an optional player select, and calls **`recordSportEvent`**.
- Basketball's `+1/+2/+3` default to `"Team score / unknown player"` and call **`recordScore`**.

**But only `recordScore` has an offline branch.** That is why five clicks on a football "Goal" queued nothing: they take a path
that has no queue at all. The acceptance test must run on a **basketball** fixture, where the scorer's own `+N` buttons exist.

### 3. What kind of picker is it?

A native `<select>` in both places — no Radix, no shadcn combobox, no modal:

| Panel | Element |
| --- | --- |
| Scorer (`LiveScoreCapture`) | `<select id="player-{seaasonClubId}">`, first option `"Team score / unknown player"` |
| Stat form | `<select name="playerId" required>` |
| Catalog panel | `<select name="playerId">` |

### 4. Selectors a Playwright script should use

```ts
// basketball: player is optional, so this is a realism step rather than a requirement
await page.locator('select[id^="player-"]').first().selectOption({ index: 1 });
await page.getByRole("button", { name: "+2", exact: true }).first().click();

// football catalog (no offline queue - do not use for the acceptance test)
const form = page.locator('h3:has-text("Sport capture")').locator("xpath=following::form[1]");
await form.locator('select[name="playerId"]').selectOption({ index: 1 });
await page.getByRole("button", { name: "Goal", exact: true }).first().click();
```

The script that implements this is `web/scripts/desktop-acceptance.mjs`; it drives the real window over CDP.

### What the run proved, and why it stopped

With the correct buttons the console's offline path fired:

```
offline: onLine=false
taps: 5 × +2
console feedback: "✓ Captured offline: +2 — queued for sync · 5 pending"
```

…and the agent's SQLite stayed empty, because **the page inside the shell is the deployed app**, and the deployed staging build
predates the agent-aware outbox. The mirror lives in `enqueue()`, which that build does not have. The next step is therefore a
staging deploy of this branch, then the same script: taps → rows in `outbox.db` → reconnect → sync → server rows.
