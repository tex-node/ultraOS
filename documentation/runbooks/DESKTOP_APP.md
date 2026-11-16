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

### The acceptance run found a real auth bug, and it blocks the loop

With the correct buttons the console's offline branch works:

```
console open · scores ["2","0"]
offline: onLine=false
taps: 5 × +2
console feedback: "✓ Captured offline: +2 — queued for sync · 10 pending"
```

…and `outbox.db` stays **empty**, because the page's authenticated call to the agent never succeeds:

```
handshake            200
stored cookie        domain=127.0.0.1  secure=false  sameSite=Lax  httpOnly=true
PING from the page   401 {"ok":false,"error":"missing or invalid agent token"}
```

**The cookie is stored and still not sent.** A fetch from `http://127.0.0.1:4120` to `http://127.0.0.1:8012` is a different origin,
and WebView2 does not attach the agent's cookie to it — SameSite=Lax did not help (tested after removing `Secure`, which had
rejected it earlier over plain http). So `enqueue()`'s mirror is fire-and-forget into a 401, which is why nothing reaches SQLite.
The offline fallback to IndexedDB is what kept the taps alive ("10 pending"), and that is the safety net doing its job.

This is a design-level flaw in the agent's auth, not a test artefact: **`Set-Cookie` from a different port is not a usable
credential for the page.** Prompt 5's downloader and vision sync depend on the same credential, so it must be fixed first.

**Two fixes, in order of preference:**

1. **Token in the handshake body, sent as a header.** `/handshake` returns `{ token }`; the page keeps it in a module variable
   (never `localStorage`) and sends `X-UltraOS-Token` on the four allow-listed actions. It gives up `HttpOnly`, and the honest
   trade is: an XSS could already *make* those four calls, so the marginal loss is reading the token — bound it to one launch and
   one window. Everything else about the boundary is unchanged.
2. **Same-origin path.** Serve the agent under the app's own origin (`/api/desktop/*` proxied to `127.0.0.1:8012`). Cookies again
   become first-party, but the proxy has to exist on the server, which contradicts "the agent is local".

Until one of these is implemented and re-verified, the acceptance section stays **Status: not yet run**, and Prompt 5 should not
start: its downloader is the same authenticated call that just returned 401.

### 2026-11-13 — header-token auth landed; acceptance still blocked

The agent auth is now a signed proof and a bearer token (Prompt 4b). Verified end to end, without a browser:

```
valid proof → 200 · tampered signature → 401 · expired proof → 401
agent call with token → 200 · without token → 401 · foreign token → 401
token from a previous launch → 401   (the in-memory map is cleared on restart)
```

And from inside the running page, after fixing the CORS preflight (`X-UltraOS-Token` was not in `allow-headers`, so every agent call
failed the preflight as "Failed to fetch"):

```
GET /api/desktop/agent-token  → 200
POST 127.0.0.1:8012/handshake → 200, agentToken issued
POST …/api/local/agent PING   → 200
```

**Still not passed.** The five offline taps were captured by the console ("Captured offline: +2 — queued for sync · 5 pending") and
a `sqlite3` read of `outbox.db` showed five rows with `syncedAt` NULL — but the agent's own `READ_OUTBOX` reported **0 pending**,
the same file showing five, so `drain()` returned before it ever called `/api/sync/outbox`. That discrepancy (two views of one file,
or two instances of the agent) is unexplained and is the next thing to chase; nothing about it is a P&L claim, so it stays
unresolved rather than papered over.

Server-side row count was never reached, because the sync request was never sent.

**Status: not yet run.** Prompt 5 should not start on this.

### ACCEPTANCE PASS — 2026-11-13 — CDP automation

Run in the desktop shell against **staging** (no production credentials were available to this agent, and a real fixture was not
to be touched). The window was driven over WebView2's DevTools port, so the session, the agent token and the SQLite file are the
ones a scorer would use.

**Before reconnect** — five taps, network cut, `outbox.db`:

```
fae5cfb1-6000-4415-a0e9-65c52bab59c3 | GameEvent | 0 | NULL
3e7047ee-91ec-43ea-8eac-f68444a62466 | GameEvent | 0 | NULL
7635e04a-1035-4d1b-b90a-3b0a3b376fad | GameEvent | 0 | NULL
b5504e09-e8e6-4e1e-a8e4-3102c619aa92 | GameEvent | 0 | NULL
e367e429-13aa-4a15-a64b-18d051077848 | GameEvent | 0 | NULL
```

Console said: `✓ Captured offline: +2 — queued for sync · 5 pending`.

**After clicking the sync badge** (`5 pending sync · Local agent`):

```
fae5cfb1-… | 0 | 2026-11-13T21:02:01Z
3e7047ee-… | 0 | 2026-11-13T21:02:01Z
7635e04a-… | 0 | 2026-11-13T21:02:01Z
b5504e09-… | 0 | 2026-11-13T21:02:01Z
e367e429-… | 0 | 2026-11-13T21:02:01Z
unsynced remaining: 0
```

**On the server** (`game e2e_bball_4632f45b`, staging):

```
GameEvent rows: 31           -- 26 from earlier test runs, 5 at 21:01:59–21:02:00 from this run
SCORE · 2 pts · 2026-11-13 21:02:00.302
SCORE · 2 pts · 2026-11-13 21:01:59.726
SCORE · 2 pts · 2026-11-13 21:01:59.511
SCORE · 2 pts · 2026-11-13 21:01:59.332
SCORE · 2 pts · 2026-11-13 21:01:59.122
```

The three outcomes match: five rows queued, five synced, five events with the sync's own timestamps.

**One limitation this run exposed, and it is real.** The mirror needs an agent token, and a token is only obtainable from
`/api/desktop/agent-token` **while the server is reachable**. If a scorer loads the console and the network is already down before
the first tap, no token exists, so that first batch is written to IndexedDB only (the safety net) and never mirrored. Once one
handshake has happened — the console is normally opened while online — the token persists and slides on use, and taps mirror
normally. The follow-up is to handshake when the capture console mounts; that is not yet deployed or verified.

**Two-view diagnostic (clean restart), recorded here because it was the open question:**

```
PING: store=sqlite · dbPath=C:\Users\XPS\AppData\Roaming\ng.neonultra.scoring\ultraos\outbox.db
SAVE_OUTBOX: {"pending":1,"received":1,"saved":1}
READ_OUTBOX (agent): 1 row · diag-1 present: true
file query: diag-1 | NULL
AGREE - both views see the row
```

Only one `outbox.db` exists on disk. The earlier disagreement was a stale agent instance holding `8012` (a second launch whose
window talked to the first process); after killing every listener and starting exactly one instance, the agent and the file agree.
`PING` now reports `dbPath` so this question is one call, not an hour.

### Rotating AGENT_SECRET

It is shared between the server and every installed desktop build, so rotation is a **coordinated release**, not a maintenance
window: rotate the web side first (installed apps fail their handshake and fall back to IndexedDB — scoring still works, the SQLite
mirror and vision stop), then ship a rebuilt desktop app, then wait for users to install it. Anyone who does not update stays on the
old secret and on IndexedDB. See `documentation/runbooks/ROTATE_SECRETS.md`.

## Mount-time handshake (Prompt 5a) — verified 2026-11-13

Staging on `2c9c8e4` (mount handshake + banner). Opened the capture console in the desktop shell and recorded what the page emits on
mount:

```
GET http://127.0.0.1:4120/api/desktop/agent-token
POST http://127.0.0.1:8012/handshake
banner: not shown
```

Because the handshake now happens at mount, the token exists before the network can drop — the gap the acceptance run exposed
("first batch after going offline with no handshake is mirrored to IndexedDB only") is closed for the normal workflow. When the
agent is genuinely unreachable, the console shows:

> Local agent unreachable. Scoring will use browser storage. Refresh when online.

That banner is silent in a plain browser, which has no agent by design.

`npm run test:e2e:local` after the change: **PASS · 7/7 · 5.6 min**.

## Vision sidecar (Prompt 5c) — blocked, and why

Three of the prompt's prerequisites do not exist in this workspace, and none of them can be manufactured honestly:

1. **No engine artifact.** There is no PyInstaller bundle, no YOLOv8 weights, and no `ultraos-vision.exe` anywhere; there is also
   no R2 bucket or signed URL to stream ~800 MB from. A downloader written against `https://<r2-bucket>/...` would compile and
   then 404. The size claim ("~800 MB") would therefore be an assertion, not a measurement.
2. **No local inference to run.** Even with a binary, the sidecar's contract (`/health`, `/analyze`, observation shape) is
   unspecified in the repo, so "health-check 8011" would be verifying a process I invented rather than the one that ships.
3. **Observations cannot be inserted as specified.** `VisionObservation` requires `analysisRunId` and `gameVideoId`, both foreign
   keys to rows created by the existing upload pipeline (`GameVideo`, `VisionAnalysisRun`). An agent cannot invent them, and an
   agent-side `vision_observations` table that invents them would write rows the server must reject.

There is a fourth issue worth naming before anyone writes the code: **the agent token is currently a random UUID**, issued by the
server inside the proof but not verifiable *by* the server afterwards. `SYNC_VISION_OBSERVATIONS` needs the server to read `orgId`
out of the token, which means the token itself must be a signed blob (`{userId, orgId, exp}` under `AGENT_SECRET`) — not an opaque
UUID. That change touches the auth path that just passed acceptance, so it should be its own change with its own re-run.

**What can be built and verified without the engine**, in this order:

1. **Signed agent token** (server + agent), so `/api/vision/sync` can verify `orgId` without trusting the request body. This is the
   security-critical piece, and it is testable today: tampered token → 401, expired → 401, valid → scoped insert.
2. **`/api/vision/sync`** with the org taken from the token, `ON CONFLICT DO NOTHING` on `id`, and a contract test that a body
   claiming a different `organizationId` is ignored.
3. **`VISION_STATUS` + `vision_observations`** in the agent (no download, no spawn): the table and the sync action can be exercised
   end to end by inserting a row locally and syncing it against an existing `analysisRunId`/`gameVideoId` obtained from staging.
4. **Downloader and sidecar supervisor** last, once a real artifact and URL exist; verify with the actual bytes, and report the
   measured size rather than the estimated one.

Doing 4 first would put an unverifiable 800 MB claim at the front of the report and an unmeasured installer size at the back.

## Prompt 5c-i — signed agent token and the vision sync contract (2026-11-14)

### The token is now signed, and the server can read the org from it

The handshake mints `base64url({userId, orgId, uuid, iat, exp}) + "." + base64url(HMAC-SHA256)` under `AGENT_SECRET`, instead of
handing back an opaque UUID. The in-memory map stays as the first gate, so a restart still kills every outstanding token even
though a signature would remain valid for 24 hours.

```
valid proof → 200 · handshake returns a signed blob ✓
tampered proof signature → 401 · expired proof → 401
agent call with token → 200 · tampered signed token → 401
agent call without token → 401 · foreign token → 401
```

### Acceptance test re-run after the auth change

```
after taps (file):  5 rows, syncedAt NULL
after sync:         5 rows, syncedAt 2026-11-14T04:50:43Z · unsynced remaining: 0
server:             31 → 36 GameEvent rows · five SCORE · 2 pts at 04:50:37–04:50:39
```

### `/api/vision/sync` refuses everything it should

```
no token → 401                       {"error":"missing agent token"}
tampered token → 401                 {"error":"invalid agent token"}
expired token → 401                  {"error":"invalid agent token"}
body org ≠ token org → 400           {"error":"organizationId does not match the agent token"}
unknown references in-org → 404      {"error":"gameVideoId or analysisRunId not found in this organization"}
missing references → 400             {"error":"gameVideoId and analysisRunId are required"}
```

The org comes from the token; a body that disagrees is **rejected**, not silently scoped. References are looked up inside
`withOrganizationContext`, so a foreign-org id is invisible and returns 404 rather than confirming it exists.

**Not yet proven:** a real accepted insert and its idempotency (`accepted: 1` then `accepted: 0`). Producing that needs a
`MediaAsset → GameVideo → VisionModel → VisionAnalysisRun` chain, which is a deeper fixture than this prompt's budget; the code path
uses `createMany({ skipDuplicates: true })`, but "the code says ON CONFLICT DO NOTHING" is not the same as watching it return zero.
That test is the first item of 5c-ii.

### Sidecar contract: `documentation/architecture/VISION_SIDECAR_CONTRACT.md`

It documents `/health`, `/analyze`, `/cancel`, the loopback-only boundary, and the constraint that shapes everything: a video must be
**registered server-side first** (it needs `gameVideoId` and `analysisRunId`), so the desktop flow is *not* fully offline. If the
network is down at registration, the file must be queued for later — not processed and then failed at sync.

Reading it against `services/vision/app/main.py` exposed a real divergence: the existing service is a **server-side job dispatcher**
(`{game_video_id, organization_id, requested_by_id}` → `{run_id, status}`, with database access), while the desktop needs a
**stateless inference worker** (`{videoPath, …}` → observations, no DB). The packaged sidecar cannot be a thin wrapper around it; the
inference core has to be extracted into a new entrypoint. That is 5c-ii's real cost, and it is larger than "build a PyInstaller
bundle".

### 5c-ii-a — `/api/vision/sync` accept + idempotency: PASS

Smallest valid chain created in the test database (`MediaAsset → GameVideo → VisionModel → VisionAnalysisRun`), token minted the
same way the desktop agent mints it, three synthetic observations posted twice:

```
fixture: org=cmwcltijm… gameVideo=cmwg361p6… run=cmwg361ql… model=cmwg361q7…
POST once:  200 {"accepted":3,"rejected":0,"duplicates":0,"rejectedReasons":[]}
POST again: 200 {"accepted":0,"rejected":0,"duplicates":3,"rejectedReasons":["DUPLICATE_ID"]}
VisionObservation rows: 3 (of 3 submitted)
fixture cleaned up
PASS — accept + idempotency
```

**A contract change came out of running it.** The first implementation returned `rejected: 3` on replay, which reads as a failure
for what is actually a healthy idempotent replay. Duplicates now have their own field: `{accepted, rejected, duplicates}` — so a
caller can tell "already applied" from "refused". `rejected` stays 0 unless a row is genuinely refused.

Run against the **local e2e database and a locally built server**, not staging: the route is not deployed yet, and creating vision
rows on staging for a fixture test would need the same cleanup for no extra coverage. Staging verification happens with the next
deploy.

### 5c-ii-b and 5c-ii-c — blocked on the machine, with numbers

| requirement | state |
| --- | --- |
| `torch`, `ultralytics`, `opencv-python` | **not installed** in either Python on this host |
| `PyInstaller` | not installed |
| model weights (`*.pt` / `*.onnx`) | **none in the repo** |
| free disk | **3.1 GB** (a CPU torch install plus a one-file PyTorch bundle needs roughly 5–8 GB during the build) |
| R2 credentials / bucket | not available to this agent |

And one finding that changes the shape of 5c-ii-b: **`YOLOAnalyzer` is not stateless today.** `app/core/analyzer.py` imports
`app.core.config` and `app.core.db.connection`, and writes `VisionTrack` / `VisionObservation` rows as it detects. The extraction is
therefore a *separation* — detection out of persistence — not a move of existing code. Its regression test ("sidecar and dispatcher
produce identical observations") requires both to run against the same clip, which needs torch, weights, and a database: none of
which this host has in a state that fits in 3.1 GB.

Recommendation before 5c-ii-b starts: free disk (the `C:\Users\XPS\apex-court-target` cargo cache is 8.4 GB and regenerable — that
is the operator's call, not mine), then install CPU-only torch and pin the weights URL, then do the split behind a test that runs
the detector on a 5-second synthetic clip and compares the observation list with the persisted rows.
cd C:\UltraLeagueOS; @'

## Windows SmartScreen on first run (accepted risk, pilot)

`ultraos-vision-engine.exe` is **unsigned**. On first run Windows shows "Windows protected your PC":

> More info → **Run anyway**

This is expected, not a malfunction, and the coach should be told before they double-click rather than during a support call. Signing
the binary is the correct long-term fix and is out of scope for the pilot.

## Production release (2026-11-15)

`app.neonultra.ng` is on `431dcaa`. Smoke against the public URL: **SMOKE OK** (club hub, training week, athlete passport,
passport provenance, scoresheets queue, player plan, selection — all PASS, 0 errors since start). `/api/desktop/agent-token`
returns 401 without a session, which is the desktop handshake route existing.

**Known deploy-script race**: the automated smoke step inside `deploy-with-log.sh` reported `SMOKE FAILED (1)` and printed a rollback
command while the release was still switching; the identical test passed a minute later. A green deploy should not tell the operator
to roll back — the smoke step needs a settle/retry.

## Installer (2026-11-15)

```
path   C:\Users\XPS\apex-court-target\release\bundle\nsis\UltraOS Scoring_1.0.0_x64-setup.exe
size   3,589,732 bytes (3.42 MB)
sha256 (recorded after a passing DoD - see below)
```

NSIS only, `installMode: currentUser`: no admin prompt, so a coach on a venue laptop can install it. The window is still declared in
Rust (`app.windows: []`), because it needs the `UltraOSDesktop` user-agent marker that gates the agent handshake — a config-declared
window would collide with it.

**Installed and launched, verified:**

```
silent install (/S)    exit 0 in 4.6s
install dir            %LOCALAPPDATA%\UltraOS Scoring\ultraos-desktop.exe (12.7 MB)
Start menu shortcut    "UltraOS Scoring" present
launch                 ultraos-agent on 8012 · loaded https://app.neonultra.ng/ · no offline page
```

**Not uploaded.** The DoD is not fully verified (steps 4-7 need a production login and a real video), and the prompt is explicit:
do not upload until the seven steps pass.

### Processing-time expectation, for the coach

CPU-only build. A 30-minute 1080p game at 30fps is ~54,000 frames; YOLOv8n on a CPU runs at roughly 2-5 fps, so expect **3-8 hours**
for a full game and considerably less for a clip. The vision panel already says: "On a laptop without a dedicated GPU, expect several
hours for a full game. Consider running this overnight."

### `local://` highlights (decision for 5c-vi)

The review page can confirm an observation on a locally-processed video; generating a `HIGHLIGHT_CLIP` from it cannot work, because
the VPS has no file — the video only exists on the coach's laptop. For the pilot the recommendation is to skip clip generation for
`local://` assets and show the observation without a clip. The audit record is what proves the workflow.

## Why a production video had no way to be processed (2026-11-15)

Three separate causes, found in this order:

1. **No trigger in the UI.** The upload flow POSTs the worker once, best-effort. If that call fails the video stays
   `READY_FOR_ANALYSIS` forever — nothing retries and the page had no button. Added: "Analyse video" / "Re-run analysis" per row,
   calling the same worker contract, surfacing the worker's error inline. (Committed, not yet deployed.)
2. **The vision stack is pointed at staging.** The running container's `DATABASE_URL` is
   `…/ultraos_staging@172.17.0.1:5433` and its media mount is `/opt/ultraos-staging/shared/media`. Production writes GameVideo rows to
   `…/ultraleagueos@127.0.0.1:55411`. So the video the web app registered **does not exist** as far as the worker is concerned:
   `POST /analyze` returns 500 `VisionAnalysisRun_gameVideoId_fkey`.
3. **The compose project cannot be restarted as-is.** It requires `VISION_ENV_FILE` and `VISION_MEDIA_DIR` from the caller's shell
   (`${VISION_MEDIA_DIR:?…}`), and its `.env` beside the compose file is not the env file in use. Any future restart needs those two
   values exported or the stack will not come up.

Decision needed before this works for production videos:

- **A — repoint the stack at production** (`DATABASE_URL` → `…:55411/ultraleagueos`, `VISION_MEDIA_DIR` → `/opt/ultraleagueos/shared/media`).
  Staging vision stops working; the stack becomes production-only.
- **B — run a second vision stack for production** (own containers, own env file, ports 8011/8020). Staging keeps working; more memory
  on a 193 GB box that is already 73% full.
- **C — desktop-only for production videos**: the local engine processes a file from the coach's laptop and syncs observations via the
  agent. No server vision at all, and the 5c flow already exists for it.

## Vision processing was impossible on production, for three reasons (2026-11-15)

An operator uploaded a two-minute clip, saw `READY_FOR_ANALYSIS`, and found no way to process it. Three separate causes:

1. **No trigger in the UI.** The upload path POSTs the worker once, best-effort; if that call fails the video waits forever, and the
   video list had no button. Added "Analyse video" / "Re-run analysis" per row, calling the same worker contract and showing the worker
   error inline. *(Committed, not yet deployed.)*
2. **The vision stack was pointed at staging.** The running container had
   `DATABASE_URL=…/ultraos_staging@172.17.0.1:5433` and mounted `/opt/ultraos-staging/shared/media`, while production writes
   `GameVideo` to `…/ultraleagueos` on `127.0.0.1:55411`. `POST /analyze` therefore died on
   `VisionAnalysisRun_gameVideoId_fkey`. Repointed to production (`ultraos-postgres:5432`, media `/opt/ultraleagueos/shared/media`).
3. **Three plumbing traps on the way**, each of which looked like a different bug:
   - `?schema=public` is a Prisma-only query parameter; psycopg rejects the URL outright ("invalid URI query parameter").
   - `ultraos-postgres` publishes only `127.0.0.1:55411`, so `172.17.0.1:55411` is refused from another network. The vision containers
     are now attached to `ops_default` and resolve it by name — **and `docker compose up -d` recreates containers, dropping that
     attachment**, so it must be re-applied after any recreate.
   - `docker compose restart` does **not** re-read `env_file`; only `up -d` (recreate) picks up a changed `DATABASE_URL`.

### State after the fix

```
POST /analyze → 200 {"run_id":"4a826210-…","status":"QUEUED"}
celery task received · "vision run queued" · worker at 183–381% CPU
```

### Bug found while verifying: two runs per request

`/analyze` creates a `VisionAnalysisRun` and returns its id, then enqueues `analyze_video`, which **creates a second run** and drives
that one. The first row stays `QUEUED` forever:

```
4a826210-… | QUEUED     | 0 obs   ← the one the API returned to the caller
a9002bb5-… | PROCESSING | 0 obs   ← the one the worker is actually running
```

The UI polls the run id it was given, so it will show "queued" while the work happens under a different id. Fix: the task should adopt
the run id it is given, not create another.

## Vision worker rebuild — three deployment traps, and the state right now (2026-11-15)

Chasing "a 2-minute clip has been PROCESSING for hours" turned into a rebuild of the vision image, and the rebuild exposed three
problems that had nothing to do with inference:

1. **The detection loop is not where I first patched it.** `app/core/analyzer.py` delegates to `app/analyzer/` since the 5c-ii-b split;
   the stride/progress patch applied to `core/analyzer.py` therefore changed nothing. The loop lives in `app/analyzer/__init__.py`.
2. **A cached `COPY app ./app` layer shipped an image without the new package.** The built image contained only
   `api core workers main.py` while the source tree had `analyzer/` and `sidecar_main.py`. Bumping a build stamp on `app/__init__.py`
   forced the layer to rebuild.
3. **`redis==5.2.1` is incompatible with the current kombu.** The rebuilt worker dies at startup with
   `VersionMismatch: Redis transport requires redis-py versions 6.1.0 or later`. The two-week-old image only worked because its kombu
   was older. Pin bumped to `6.1.0`.

**State at the time of writing**: the worker container is **down** (VersionMismatch) while the image rebuilds — vision processing is
offline until that finishes. `POST /analyze` still returns a run id (the API is up), but nothing consumes the queue.

Committed: frame stride + progress logging, single-run adoption (`analyze_video(run_id=…)`), redis pin.

Once the rebuild lands: recreate, re-attach `ops_default`, trigger a run, and confirm observations land — with stride 5, 3,600 frames
become 720 inferences.

## The measured number, and what it decides (2026-11-15)

```
yolov8n · 640x360 synthetic · predict()
20 calls in 1,223.4 s → 0.016 fps (≈61 s per inference)

host: 6 cores · load average 34.30 / 29.47 / 26.20
containers on the same box: supabase (db, kong, meta, studio), powervend (kong, meta, studio), the web app, postgres
```

That is not "slow". At 61 seconds per frame, a **300-frame cap with stride 5 (60 inferences) is still about an hour**, and the
uncapped 3,600-frame clip is measured in days. The earlier 70-minute run was not hung; it was exactly this.

The VPS worker is therefore **not viable for CPU vision at all** on this host, at any clip length that matters. It stays useful for
`/health`, queue mechanics, and proving the pipeline end to end with tiny inputs — not for processing a game, and not for a highlight.

**Where processing actually belongs:**

| | desktop sidecar | VPS worker |
| --- | --- | --- |
| hardware | coach's laptop, 8–16 cores at 3.5–4.5 GHz, nothing else running | shared 6-core host already running ~30 load units of Supabase, Postgres and the web app |
| measured | not yet benchmarked on this machine | **0.016 fps** — ~61 s per inference |
| viable for | full games (hours without a GPU) and highlights | pipeline tests only |
| ships in | the 249 MB sidecar the coach installs | this deployment |

The desktop is the right place for video, and always was. The VPS path was a convenience for people who would not install anything;
the honest replacement for that convenience is a GPU (v37), not more tuning here.

### Config now set

```
VISION_FRAME_STRIDE=5      # every 5th frame
VISION_PROGRESS_EVERY=100  # log every 100 processed frames
VISION_MAX_FRAMES=300      # 10 s at 30 fps — a highlight, not a game
```

The cap is a guardrail against a queue that never drains, not a way to make the VPS usable.

### The other bug found while cancelling

`vision-beat` was re-queueing the video every few minutes through `poll_ready_videos`, so each cancellation simply produced another
run — the video had accumulated **eight** runs. The beat container is now stopped. Any future "cancel" needs it stopped first, or the
run comes back.

## Desktop distribution — published (2026-11-16)

```
url     https://pub-e130aa56d5b242f68e0574ce9e065d59.r2.dev/apps/UltraOS-Scoring-1.0.0-x64-setup.exe
size    3,588,522 bytes (3.42 MB)
sha256  024213d9d170d008cc2a71e9a85c2e944f65754d503286f0b4addd36ca3e0a5e
HEAD    200 · application/x-msdownload · content-length 3,588,522
```

The installer is unsigned: Windows SmartScreen appears on first run — **More info → Run anyway**. The download page says so before the
click.

**The desktop app is required for AI Vision processing.** The VPS worker is for 10-second test clips only and takes roughly an hour per
clip on shared hardware (measured: 0.016 fps). On a modern laptop, expect 3–6 hours to process a full 30-minute game — run it
overnight. GPU acceleration is v37.

## Fal activation: build the image before setting the endpoint (2026-11-16)

The committed Fal code is currently `docker cp`-ed into the running worker; the image is stale. That makes the obvious activation order
wrong:

```
WRONG: env edit → docker compose up -d (recreate) → test      # recreate restores the stale image, fal_tasks vanishes
RIGHT: docker compose build worker → docker compose up -d → env edit → recreate → test
```

`docker compose up -d` recreates a container from its image, so any `docker cp` change is lost — that is exactly how an earlier
`ModuleNotFoundError: app.core.fal_client` appeared after a restart. Build first, then configure, then test.

Also still true and easy to forget: `vision-beat` must stay **stopped** (it re-queues every READY_FOR_ANALYSIS video), and the vision
containers must be re-attached to `ops_default` after any recreate or they cannot resolve `ultraos-postgres`.
