# Desktop Companion App — feasibility and architecture

**Status:** proposal, for review before any code is written.
**Scope:** offline scoring that does not depend on a browser tab, plus local AI vision inference, for courtside and analysis use.

---

## 1. What actually has to be true

The brief asks for a desktop app that wraps the existing Next.js UI, stores offline data locally, and bundles the Python vision
worker as a sidecar. Three constraints decide the architecture before anything else:

| Constraint | Fact about this codebase |
| --- | --- |
| **The UI cannot be rewritten** | ~80 route directories, 65 prebuilt pages, server components, server actions. All of it assumes a Node server. |
| **The app needs a live server** | Server components, server actions (`"use server"`), route handlers, and middleware all require the Next runtime. `next export` produces a static site that **cannot** run any of them. |
| **The app needs Postgres** | Prisma + `@prisma/adapter-pg`, row-level security policies, `withOrganizationContext` transactions. SQLite cannot host this schema without deleting the tenancy model. |

So "wrap the existing build" has exactly two honest readings, and they are very different products.

---

## 2. Tauri vs Electron

| | Tauri 2 | Electron |
| --- | --- | --- |
| Installer size | ~3–10 MB shell (+ WebView2 runtime, present on Windows 11) | ~80–150 MB, Chromium bundled |
| Memory at idle | 40–80 MB | 150–300 MB |
| Sidecar support | First class (`externalBin`, `Shell::sidecar`) | Child process, DIY |
| Renderer engine | OS WebView (WebView2 / WKWebView) — **differs per OS** | One Chromium everywhere |
| Rust required | Yes (toolchain, ~1 GB build deps) | No |
| Remote-origin app | Supported but privileged surface must be gated carefully | Same problem, more mature tooling for it |
| Verdict | **Recommended** | Fallback if WebView2 flakiness appears on club laptops |

Tauri is the right default: the installer is small enough to hand out on a USB stick at a venue, the sidecar mechanism is exactly
what the vision worker needs, and the memory footprint matters on the second-hand laptops that community leagues actually use.
The cost is a Rust toolchain in the build pipeline and WebView2 as an OS dependency (shipped with Windows 11; a bootstrapper can
install it for Windows 10).

**Engine divergence is the one real risk**: WebView2 and WKWebView are not Chromium, and this app is tested on Chromium only. A
desktop shell that renders differently from the browser is a new class of bug. Mitigation: the E2E suite runs against the hosted
URL in Chromium, and a desktop smoke list (login, score a game, sync) is walked by hand on WebView2 before each release.

---

## 3. The decision: two architectures, one recommendation

### Option A — bundle the whole server (Node + Postgres inside the installer)

Tauri starts a sidecar Node process running `next start`, plus a local Postgres (or PGlite), and the webview loads
`http://127.0.0.1:3000`.

- **Gains:** genuinely offline for *every* page, server actions work, no protocol changes.
- **Costs:** a ~200 MB installer (Node + Postgres + the app), a second full stack to keep patched, a database that must be
  migrated on the customer's machine, and a real risk of divergence from the hosted product. This is not a shell around the app;
  it is a second deployment of it.

### Option B — thin shell around the hosted app, with a local agent for offline writes *(recommended)*

The Tauri window loads the **hosted** app (`https://app.neonultra.ng`). Offline scoring already works in this codebase — the
IndexedDB outbox, `LocalScoringRepository`, idempotency keys, `drain()` — and the only thing a browser cannot give us is
*durable, unbounded* storage and *native* vision inference. So the desktop app supplies exactly those two things and nothing else:

```
┌───────────────────────────── Tauri window ─────────────────────────────┐
│  WebView → https://app.neonultra.ng  (unchanged Next.js app)           │
│      │                                                                  │
│      │ window.__ULTRAOS_DESKTOP__ === true  (injected initialization)   │
│      ▼                                                                  │
│  Desktop Agent  http://127.0.0.1:8012   ← Rust, inside the Tauri process│
│      ├── POST /outbox/append        SQLite: outbox, events, games       │
│      ├── GET  /outbox/pending                                           │
│      └── POST /vision/analyze  →  proxy to 127.0.0.1:8011               │
│                                                                         │
│  Vision sidecar  http://127.0.0.1:8011  ← PyInstaller bundle of          │
│      services/vision (FastAPI), started and supervised by Tauri         │
└─────────────────────────────────────────────────────────────────────────┘
             │ sync when online: POST /api/sync/outbox (existing route)
             ▼
        VPS: Next.js + Postgres + RLS
```

**Why a localhost agent rather than exposing Tauri IPC to the page.** The webview loads a *remote* origin. If the page can call
Tauri commands directly, then anyone who can inject script into that origin — an XSS, a compromised dependency, a malicious
extension-free but hostile page — inherits filesystem and process access. Keeping the privileged surface behind
`127.0.0.1:8012`, with a fixed command allow-list, CORS pinned to the app origin, and a per-install token issued at first launch,
means the blast radius of an XSS stays inside the browser sandbox where it already lives. This is the security argument for the
agent, and it is the reason Option B is not just "Option A minus Postgres".

**What the user loses offline in Option B:** every page that requires a server render (standings, admin, coaching). That is
acceptable because the courtside job — open a fixture, score it, close it — runs from the capture console's client-side path and
the local outbox. It is also honest: a desktop app that pretends to render server pages offline is Option A, with all its cost.

---

## 4. Local storage: SQLite schema

SQLite replaces IndexedDB **only when the desktop flag is present**; the web keeps Dexie. The tables mirror the existing Dexie
schema so the repository can switch without changing its callers (`src/lib/offline/repositories/scoringRepository.ts`).

```sql
-- outbox: one row per pending canonical write, exactly like the Dexie table
CREATE TABLE outbox (
  local_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type        TEXT NOT NULL,          -- GameEvent | PlayerStat | Game | ...
  entity_id          TEXT NOT NULL,
  operation          TEXT NOT NULL,          -- CREATE | UPDATE | DELETE
  payload            TEXT NOT NULL,          -- JSON, the same shape the API already accepts
  client_updated_at  TEXT NOT NULL,
  idempotency_key    TEXT NOT NULL UNIQUE,   -- existing key format, unchanged
  device_id          TEXT NOT NULL,
  synced_at          TEXT,
  failure_reason     TEXT,
  attempt_count      INTEGER NOT NULL DEFAULT 0,
  dead_lettered_at   TEXT,
  last_manual_retry_at TEXT,
  ledger_source_hint TEXT
);
CREATE INDEX outbox_pending ON outbox (synced_at, dead_lettered_at);

-- local game shell + events, so the console can render without a server round trip
CREATE TABLE games        (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE game_events  (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, payload TEXT NOT NULL, seq INTEGER NOT NULL);
CREATE TABLE player_stats (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, payload TEXT NOT NULL);

-- the per-install agent token and device identity
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

`UNIQUE` on `idempotency_key` is the whole safety story: the same key can be queued twice by a retry and will still replay once
server-side, which is what `/api/sync/outbox` already guarantees.

---

## 5. Sync protocol

**Unchanged on the wire.** The agent is a local store, not a new protocol:

1. The page writes to the local agent (`POST /outbox/append`) with the idempotency key it already generates.
2. When `navigator.onLine` and the app is signed in, `drain()` asks the agent for pending rows, then `POST /api/sync/outbox`
   with the same batch shape the browser sends today (`syncOutboxRequestSchema`).
3. The route authorizes every fixture in the batch, replays each record idempotently, and returns per-record outcomes; the agent
   marks `synced_at` or stores `failure_reason` / `dead_lettered_at`.
4. Conflict rule: last write wins on `client_updated_at`, server authoritative — the existing replay already implements this.

Nothing new is required server-side for Prompt 3. That is deliberate: a desktop app that needs a new endpoint is a desktop app
that needs its own deployment, and we already have one that works.

---

## 6. Vision sidecar

`services/vision` is FastAPI (`app/main.py`, `/analyze`, `/health`). The desktop build ships it as a **PyInstaller one-file
bundle** and runs it under Tauri's sidecar supervision:

```
tauri.conf.json → bundle.externalBin: ["binaries/vision-worker-$TARGET_TRIPLE"]
sidecar args:   --host 127.0.0.1 --port 8011
health:         GET http://127.0.0.1:8011/health, polled at startup; the app shows "Vision: ready/unavailable"
```

Inference runs locally and produces **observations only** — this service never writes canonical scoring data (its own docstring
says so, and the architecture doc records why). Observations go through the same outbox as everything else and sync when online,
so a venue with no signal still gets its video analysed and the results land later.

**Size and licensing note:** a PyInstaller bundle with torch/ultralytics is 400 MB–1.5 GB depending on the model. That is the one
place the "small installer" advantage of Tauri disappears. Options, to decide in Prompt 4: bundle a small detection model only
(YOLO-nano class, ~10 MB + ~200 MB runtime), or ship vision as an optional component downloaded on first use. Recommendation:
**optional component**, because most scorers never open the vision tab and should not pay a gigabyte for it.

---

## 7. Risks, ranked

| Risk | Impact | Mitigation |
| --- | --- | --- |
| WebView2 rendering differences from Chromium | Medium | desktop smoke list per release; Playwright stays Chromium truth |
| Rust toolchain in the build pipeline | Medium | CI job with `dtolnay/rust-toolchain`; Windows + macOS runners only |
| Remote-origin privileged surface | **High** | localhost agent with allow-list + per-install token; never enable Tauri IPC for the remote origin |
| Vision bundle size | Medium | optional component, not in the base installer |
| Two offline stores (Dexie + SQLite) drift | Medium | one interface (`scoringRepository`), one contract test suite run against both backends |
| Code signing / SmartScreen | Medium | unsigned builds warn on Windows; budget for a certificate before distribution |

---

## 8. Phased plan (maps to the streak's prompts)

| Prompt | Deliverable | Proof |
| --- | --- | --- |
| 2 | Tauri shell loading the hosted app in a native window | app launches, login works, navigation identical |
| 3 | Local agent + SQLite outbox, repository switches on `__ULTRAOS_DESKTOP__` | score offline → rows in the `.db` file → sync → staging rows, with wifi toggled |
| 4 | Vision sidecar + local `/analyze` routing | a 10-second clip analysed with the network off; observations sync later |
| 5 | Installer build, runbook, full suite | installer runs on a clean Windows profile |

Per Prompt 3's verification: the SQLite file is inspectable with any viewer, and the acceptance test is a *score, kill the wifi,
score again, restore the wifi, sync, check staging* — not a unit test that mocks the boundary.

---

## 9. What I need from you before writing code

1. **Approve Option B** (thin shell + localhost agent) or ask for Option A (bundled server). This is the decision that determines
   everything else, and A roughly triples the installer and the maintenance surface.
2. **Confirm the desktop target is Windows-first.** The lean laptops at venues are overwhelmingly Windows; macOS support in
   Tauri is cheap but the vision bundle and code signing are not free.
3. **Confirm the vision bundle policy**: optional download (recommended) or included in the installer.

Once those are settled, Prompt 2 is a day's work: `npm i -D @tauri-apps/cli`, `npx tauri init`, a window pointing at the hosted
app, and one Rust command handler for the agent listener.
