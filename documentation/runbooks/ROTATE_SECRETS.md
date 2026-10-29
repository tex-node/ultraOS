# Rotating every secret in the platform

**Why this exists.** Two secrets leaked in streak v27 (a script of mine ran `export $(… | xargs)` and, with empty input,
that is a bare `export`, which prints the whole environment). Nothing reached git, but the incident showed that the project
had no rotation procedure — only a vague memory of where each secret lived. This is that procedure.

**The rule before anything else:** *revoke first, rotate second*. Revocation takes ~30 seconds; a full rotation takes
minutes and several restarts. If a key is in the wrong place, kill it now and rotate at leisure.

**Every command below references a variable NAME. If you find yourself typing a value, stop.**

---

## 1. The secrets, and what each one costs to rotate

| secret | where it lives | rotation time | impact of rotating |
| --- | --- | --- | --- |
| `AUTH_SECRET` | `/opt/ultraleagueos/shared/web.env`, `/opt/ultraos-staging/shared/web.env` | 5 min | **every session invalidates**; all users sign in again |
| `CRON_SECRET` | both env files + `deploy/ops/install-feed-drain-timer.sh` (embedded in the unit) | 5 min | the feed-drain timer fails 401 until the script is re-run |
| `BACH_IO` (sandbox) | staging env only | 2 min | staging checkout stops until the new key is in |
| `BACH_IO` (live) | production env only | 5 min | **checkout is down** between revoke and restart |
| `BACHS_WEBHOOK_SECRET` | both env files (legacy name: `BACH_WEBHOOK`) | 5 min | webhooks fail signature verification until both are restarted; Bachs retries |
| `DATABASE_URL` password (`ultraos`, `ultraos_app`) | both env files, `shared/migrate.env`, **`/opt/ultraos-vision/vision.env`** | 30 min window | the app, migrations, backups **and the vision worker** break if any copy is missed |
| R2 access keys | both env files, **and `/opt/ultraos-vision/vision.env`** | 10 min | media uploads fail; existing objects keep serving through the public URL |
| `FAL_KEY` | `/opt/ultraos-vision/vision.env` | 10 min | video analysis stops; queued clips fail and retry |
| Google OAuth client secret | `cred/` + production env | 15 min | Google sign-in fails until the new secret is deployed |

**The two places people forget** (both are copies, not references):

1. **`/opt/ultraos-vision/vision.env`** holds its own `DATABASE_URL` and R2 credentials. Rotate either without editing it and
   the vision worker keeps working until its next restart, then fails with `password authentication failed` or a storage
   error — hours later, with no obvious link to the rotation.
2. **`deploy/ops/install-feed-drain-timer.sh`** writes `CRON_SECRET` into a systemd unit's `ExecStart`. The env file is not
   the only place the value lives.

---

## 2. The commands, one secret at a time

### 2.1 `AUTH_SECRET` (5 min)

```bash
ssh raivstream
sudo cp /opt/ultraleagueos/shared/web.env /opt/ultraleagueos/shared/web.env.bak-$(date -u +%Y%m%dT%H%M%SZ)
NEW=$(openssl rand -base64 32)
sudo sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=\"$NEW\"|" /opt/ultraleagueos/shared/web.env
sudo systemctl restart ultraos-web.service
unset NEW
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4110/api/v1/live     # 200
```

Repeat for staging with `/opt/ultraos-staging/shared/web.env` and `ultraos-staging-web.service`.

**Verify:** a page that requires a session redirects to `/login` (the old cookie no longer verifies), and a fresh sign-in
works. This was executed on staging on 2026-10-28 and the e2e suite (which signs in for real) passed afterwards.

### 2.2 `CRON_SECRET` (5 min)

```bash
NEW=$(openssl rand -hex 32)
sudo sed -i "s|^CRON_SECRET=.*|CRON_SECRET=\"$NEW\"|" /opt/ultraleagueos/shared/web.env
sudo bash deploy/ops/install-feed-drain-timer.sh        # rewrites the unit with the new header value
sudo systemctl daemon-reload && sudo systemctl restart ultraos-web.service
unset NEW
systemctl list-timers --no-pager | grep -i feed
```

**Verify:** the timer's next run succeeds (`journalctl -u <feed-drain unit> -n 20` shows no 401).

### 2.3 `BACH_IO`, sandbox → staging (2 min)

```bash
# dashboard: Bachs -> Developers -> API keys -> revoke the old sandbox key -> create a new one
# copy the sk_sandbox_… value, then:
sudo cp /opt/ultraos-staging/shared/web.env /opt/ultraos-staging/shared/web.env.bak-$(date -u +%Y%m%dT%H%M%SZ)
sudo nano /opt/ultraos-staging/shared/web.env     # BACH_IO=<new sandbox key>
sudo systemctl restart ultraos-staging-web.service
```

**Verify:** `/settings/billing` on staging shows no test-mode banner, and Upgrade redirects to `checkout.bachs.io`.

**Scope trap, observed 2026-10-29:** a key can authenticate and still fail with
`API key missing required scope: payments:write`. Create the key **with the payments scope** or the upgrade button is dead.

### 2.4 `BACH_IO`, live → production (5 min, brief checkout outage)

Same as 2.3 against `/opt/ultraleagueos/shared/web.env` and `ultraos-web.service`. This is the one rotation that takes the
revenue path down for a few seconds; do it outside a sales push. §7 of `BACHS_LIVE_MIGRATION.md` is the verification.

### 2.5 `BACHS_WEBHOOK_SECRET` (5 min)

Dashboard → **Webhooks → Roll signing secret**, then update **both** env files (the app reads `BACHS_WEBHOOK_SECRET`; the
legacy `BACH_WEBHOOK` may also be present — check which one the running code resolves, do not assume).

```bash
sudo grep -c '^BACHS_WEBHOOK_SECRET=' /opt/ultraleagueos/shared/web.env    # 0 means the app uses the legacy name
```

Restart both services. **Verify:** force a delivery from the dashboard's event log and confirm a **200**; a **400** is a
signature mismatch, a **503** means the app sees no secret at all.

### 2.6 Database passwords (`ultraos`, `ultraos_app`) — 30 min window

This is the only rotation that needs a maintenance window, because **five** places hold the password:

1. `/opt/ultraleagueos/shared/web.env`
2. `/opt/ultraos-staging/shared/web.env`
3. `/opt/ultraleagueos/shared/migrate.env`
4. `/opt/ultraos-vision/vision.env`
5. `/opt/ultraleagueos/shared/backup-database.sh.pre-repair-*` and any other `.bak` — delete, do not rotate

Use `scripts/rotate-db-password.sh` (v28) if it is present; otherwise `ALTER ROLE … PASSWORD`, update 1–4, then:

```bash
sudo systemctl restart ultraos-web.service ultraos-staging-web.service
sudo systemctl restart ultraos-vision.service
sudo systemctl start ultraos-backup.service            # prove the BACKUP still authenticates
sudo journalctl -u ultraos-backup.service -n 20
```

**The step people miss:** the backup unit. It reads the env file, so it breaks at 02:00, silently, unless you run it once by
hand. `deploy/ops/backup-freshness.sh` is the alarm that eventually notices — do not rely on it.

### 2.7 R2 access keys (10 min)

Cloudflare → R2 → **Manage R2 API Tokens** → roll. Update both env files **and** `/opt/ultraos-vision/vision.env`, restart
all three services, then upload one small file through the app and confirm it appears in the bucket (a 200 from the app is
not proof if the app swallows storage errors).

### 2.8 `FAL_KEY` (10 min)

FAL dashboard → revoke → new key → `sudo nano /opt/ultraos-vision/vision.env` → `sudo systemctl restart ultraos-vision.service`,
then `curl -s http://127.0.0.1:8010/health` and one short ingest to prove the analyzer still loads.

---

## 3. What to do immediately after a leak

1. **Revoke first.** Dashboard → API keys → revoke, or `ALTER ROLE` for a database password. Seconds, not minutes.
2. **Treat every place the value appeared as compromised:** a tool transcript, a CI log, a chat, a screenshot, a `.bak`
   file, a `git log -p` output. If it was in a shell pipeline, the shell's history file has it too.
3. **Rotate** with the corresponding section above. Rotate the *paired* secret as well when the platform links them (a live
   key and the webhook secret are usually leaked together, because they are usually pasted together).
4. **Notify** whoever needs to know (the owner; a customer if their data could have been read).
5. **Document it in `session.md`** with the **key name**, the incident window, and the actions taken — never the value:

   ```
   2026-10-28 · AUTH_SECRET and CRON_SECRET (staging) · exposed in a tool transcript at 13:4x for <1 min
   · rotated 13:52, staging service restarted, sessions invalidated, sign-in re-proved by e2e
   · not rotated: BACH_IO sandbox + BACH_WEBHOOK (needs dashboard), production DB password (coordinated change)
   ```

6. **Ask why the value was printable at all.** In v27 the cause was a script whose failure path turned an "export these
   values" line into "export everything". The fix is in §5.

---

## 4. How to check for leaks

```bash
# 1. any key-shaped string in logs, markdown, or stray files (values are NOT printed, only file names and counts)
grep -rEl 'sk_(live|sandbox|test)_[A-Za-z0-9]' /opt/ultraos-staging/ /opt/ultraleagueos/ \
  --include='*.log' --include='*.md' --include='*.txt' --include='*.bak*' 2>/dev/null

# 2. journal chatter that mentions secrets
journalctl -u ultraos-web.service --since "7 days ago" | grep -icE 'sk_live|sk_sandbox|whsec_|AUTH_SECRET='

# 3. commits that ever contained a key-shaped string outside documentation
git log --all -p -S 'sk_live_' -- ':!*.md' | head -40

# 4. .bak files created by rotations (they hold the PREVIOUS value - treat as secrets, then delete)
find /opt/ultraleagueos/shared /opt/ultraos-staging/shared -maxdepth 1 -name '*.bak-*' -mtime +14 -print
```

A hit in step 1 on a `.bak` file is expected and benign **if** the file is mode 600 and scheduled for deletion. A hit in a
committed file is an incident: §3.

---

## 5. The root-cause lesson, and the lint that would have caught it

The v27 leak was one line:

```bash
export $(echo "$OUT" | grep -E '^E2E_[A-Z_]+=' | xargs)     # WRONG
```

When `$OUT` is empty — a preparation script failed, a command changed its output — the substitution expands to nothing and
the line becomes:

```bash
export          # prints the entire environment, secrets included, to stdout
```

Three defences, in increasing order of usefulness:

1. **Check for empty input before exporting.**

   ```bash
   line=$(echo "$OUT" | grep -E '^E2E_[A-Z_]+=' | head -1)
   [ -n "$line" ] || { echo "preparation produced nothing"; exit 1; }
   eval "export $line"
   ```

2. **Prefer reading the env file to exporting a computed list.** `set -a; . /path/to/web.env; set +a` cannot dump the
   environment, because it never runs a bare `export`:

   ```bash
   set -a; . /opt/ultraos-staging/shared/web.env; set +a
   ```

3. **Run `shellcheck` at error level in CI**, with these rules promoted:

   - `SC2155` — declare and assign separately (`local x=$(cmd)` hides the command's exit status)
   - `SC2046` — unquoted command substitution (the shape of the bug above)
   - `SC2086` — unquoted variable expansion (word-splitting surprises)

   `shellcheck -S error -e SC1091 deploy/**/*.sh scripts/*.sh` in CI would have flagged the unquoted substitution before it
   ever ran with empty input.

---

## 6. After any rotation, prove the dependent paths

A rotation is not done when the service restarts; it is done when everything that *uses* the secret works.

| rotated | prove it with |
| --- | --- |
| `AUTH_SECRET` | sign in through `/login` (the e2e does this — `npm run test:e2e`) |
| `CRON_SECRET` | `systemctl start` the feed-drain timer's unit once and read its journal |
| `BACH_IO` | `/settings/billing` → Upgrade redirects to `checkout.bachs.io` |
| `BACHS_WEBHOOK_SECRET` | a dashboard-triggered delivery returns 200 to `/api/webhooks/bachs` |
| database password | `sudo systemctl start ultraos-backup.service` **and** `curl -s :8010/health` for the vision stack |
| R2 keys | one real upload through the app, confirmed in the bucket |
| `FAL_KEY` | one ingest, confirmed by a new `VisionAnalysisRun` row reaching COMPLETED |

---

## 7. See also

- `BACHS_LIVE_MIGRATION.md` — the live-key migration, including the ₦100 proof payment.
- `SHARED_VPS_RISK.md` — what else is on the host, so a rotation window can be sized against it.
- `LAUNCH_READY.md` §4/§5 — disk emergencies and restores, which interact with the backup unit in §2.6.
- `session.md` 2026-10-28 — the incident that produced this document.
