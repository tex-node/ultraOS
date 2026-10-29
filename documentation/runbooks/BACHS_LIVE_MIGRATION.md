# Bachs live migration — production runbook

**Who this is for:** the platform owner. Every step marked **YOU** is a dashboard or credential action that needs your
login; everything else is verification you can run as-is.

**Time:** ~30 minutes (15 reading, 15 doing). **Risk:** medium — the checkout flow is briefly unverified while keys change,
and one real card charge is part of the proof (refunded).

> **Current state (verified read-only on 2026-10-29, again at 04:0x).** Production is *not* on fresh live credentials:
>
> | item | value today | what it must be |
> | --- | --- | --- |
> | `BACH_IO` | `sk_live_b8e…` (60 chars) — the key that has been in the repo's `cred/` since v22 | a **freshly issued** live key |
> | `BACH_WEBHOOK` / `BACHS_WEBHOOK_SECRET` | `whsec_815c2…` — the original secret from `cred/gateway_env.txt` | a **rolled** secret |
> | `BACHS_PRODUCT_PRO` | **unset** | `prod_a2588c7531b24b27ace2` |
> | `BACHS_PRODUCT_ENTERPRISE` | **unset** | `prod_0cf8f25781df468ebd99` |
> | `BACHS_MOCK` | unset (never was set in production) | remains unset |
> | Plans in production | Neon Ultra = ENTERPRISE, LBCL = ENTERPRISE | unchanged by this runbook |
> | Bachs audit rows in production | **none** | `ORG_UPGRADED_BY_BACHS` + a downgrade after the refund |
>
> So this runbook is a real migration, not a confirmation. Two things follow from that: the leaked key from `cred/` must be
> revoked (**YOU**), and no "we are already live" assumption may skip the ₦100 proof payment.

---

## 1. Pre-flight checks (~5 min)

Run these before touching anything. Each has an expected answer; if you get a different one, stop and read §8.

```bash
ssh raivstream

# 1a. the service is healthy now (so a later failure is unambiguously ours)
systemctl is-active ultraos-web.service
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4110/api/v1/live     # expect 200

# 1b. which Bachs variables are present (names only - this command redacts values)
sudo grep -E '^(BACH_IO|BACH_WEBHOOK|BACHS_WEBHOOK_SECRET|BACHS_PRODUCT_PRO|BACHS_PRODUCT_ENTERPRISE|BACHS_MOCK)=' \
  /opt/ultraleagueos/shared/web.env | sed -E 's/(sk_(live|sandbox|test)_|whsec_)[A-Za-z0-9_-]+/\1***/'

# 1c. is mock mode on? (an unset BACHS_MOCK means mock is OFF)
sudo grep -c '^BACHS_MOCK=' /opt/ultraleagueos/shared/web.env     # expect 0

# 1d. what the billing page renders today
#     (open https://app.neonultra.ng/settings/billing signed in as a SUPER_ADMIN)
```

**Expectation:** `BACH_IO` starts with `sk_live_`, `BACHS_MOCK` is absent, and the billing page shows **Upgrade to Pro**
with **no** "Test mode" banner. If the page shows *"No Bachs product configured for PRO"*, that is exactly what this
runbook fixes.

**Also check the dashboard (YOU):**

- [ ] The **old** live key (`sk_live_b8e…` in the pre-v29 env) is **revoked** — it has been in a repository's `cred/`
      directory, which is enough for it to be considered compromised.
- [ ] The **old** webhook secret is **rolled** (see §3).
- [ ] You know the two **live** product ids: `prod_a2588c7531b24b27ace2` (PRO), `prod_0cf8f25781df468ebd99` (ENTERPRISE).
      The **TEST** id `prod_582d912f93cf444cb827` is staging-only and must never appear in a production env file.

---

## 2. Generate the live key (**YOU**, ~3 min)

1. Bachs dashboard → **Developers → API keys → Create live key**.
2. **Scope matters.** A key without the payments scope can authenticate and still fail the first real action. The migration
   is blocked by `API key missing required scope: payments:write` (observed on staging, 2026-10-29) unless the key is
   created with:
   - `payments:write` — required to create a checkout session (the upgrade button)
   - `products:read` — optional, but it is what lets you list products instead of copying ids
   - the subscription/webhook scopes the dashboard offers alongside them
3. Copy the `sk_live_…` value into your password manager. **Do not paste it into a document, a chat, an issue, or a commit.**
   This runbook deliberately uses `<NEW_LIVE_KEY>` placeholders.

---

## 3. Roll the webhook signing secret (**YOU**, ~2 min)

1. Dashboard → **Webhooks → Roll signing secret**.
2. Copy the new `whsec_…` value (password manager again).
3. Note the time: webhooks signed with the old secret will fail verification from that moment until §5 restarts the app.
   Bachs retries, and the endpoint answers **400** for a bad signature (never 200), so a missed delivery is retried rather
   than silently dropped — but a long gap is still lost time.

---

## 4. Back up before you change anything (~2 min)

Production changes require a backup, and a database dump alone is not enough — the env file is the thing you are about to
edit.

```bash
ssh raivstream
TS=$(date -u +%Y%m%dT%H%M%SZ)

# the env file, first and always
sudo cp /opt/ultraleagueos/shared/web.env "/opt/ultraleagueos/shared/web.env.bak-$TS"
sudo chmod 600 "/opt/ultraleagueos/shared/web.env.bak-$TS"

# and the database, so a checkout that writes a bad plan row has a restore point
priv=$(sudo grep -m1 '^DATABASE_URL=' /opt/ultraleagueos/shared/migrate.env | cut -d= -f2-)
sudo pg_dump "$priv" -Fc -f "/var/backups/ultraleagueos-production/ultraleagueos_pre_live_$TS.dump"
sudo sha256sum "/var/backups/ultraleagueos-production/ultraleagueos_pre_live_$TS.dump"

echo "restore point: web.env.bak-$TS + ultraos_pre_live_$TS.dump"
```

Keep that timestamp; §8 needs it.

---

## 5. Update the production env (**YOU**, ~5 min)

Edit the file **in place** with an editor. Never `echo … >>` and never a heredoc: both leave the secret in your shell
history, and `history` is a log.

```bash
sudo nano /opt/ultraleagueos/shared/web.env      # or: sudo vim /opt/ultraleagueos/shared/web.env
```

Set (or replace) exactly these lines. The app reads the **legacy** names (`BACH_IO` / `BACH_WEBHOOK`); the newer pair
(`BACHS_KEY` / `BACHS_WEBHOOK_SECRET`) is also read, so pick one pair and stay consistent:

```ini
# the freshly issued live key from §2
BACH_IO=<NEW_LIVE_KEY>

# the rolled secret from §3 - note the variable name the app reads is BACHS_WEBHOOK_SECRET,
# while the legacy name is BACH_WEBHOOK. Set the one the app reads; leave the legacy one alone.
BACHS_WEBHOOK_SECRET=<NEW_WEBHOOK_SECRET>

# the two live product ids - CORRECTED 2026-10-29. The ids that were here before
# (prod_56446… / prod_c2d13…) belong to a different Bachs account and fail with "product not found".
BACHS_PRODUCT_PRO=prod_a2588c7531b24b27ace2
BACHS_PRODUCT_ENTERPRISE=prod_0cf8f25781df468ebd99
```

And **remove** (or set to `0`) any line reading `BACHS_MOCK=1`. Production has never had it set, so this should be a no-op —
check anyway.

> **Do not add `BACHS_API_BASE` or change `BACH_API_BASE`.** The SDK derives the host from the key prefix
> (`sk_live_` → `api.bachs.io`, `sk_sandbox_` → `sandbox-api.bachs.io`) and *refuses* a mismatch. v24 lost an afternoon to a
> lease on `BACH_API_BASE` sending a sandbox key to the live host (`401 Invalid API key`).
>
> **Do not paste the key into the file's comments.** Comments are read by the next person and by `grep`.

Save, then confirm the file says what you think it says — **redacted**:

```bash
sudo grep -E '^(BACH_IO|BACH_WEBHOOK|BACHS_WEBHOOK_SECRET|BACHS_PRODUCT_PRO|BACHS_PRODUCT_ENTERPRISE|BACHS_MOCK)=' \
  /opt/ultraleagueos/shared/web.env | sed -E 's/(sk_live_|whsec_)[A-Za-z0-9_-]+/\1***/'
```

---

## 6. Restart and verify the wiring (~2 min)

```bash
sudo systemctl restart ultraos-web.service
sleep 3
systemctl is-active ultraos-web.service
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4110/api/v1/live     # 200
```

Two notes on the verification commands, both learned the hard way:

- The health endpoint is **`/api/v1/live`**. `/api/health` returns **404** on this deployment (checked 2026-10-29), so a
  runbook that says "curl /api/health" sends you chasing a broken deploy that is fine.
- If the service is `failed`, the reason is in `journalctl -u ultraos-web.service -n 50`. The most likely cause is the new
  key being rejected at startup by the billing-safety guard — see §8.

Then, in the browser on **production**:

- [ ] `/settings/billing` shows **no** "Test mode" banner.
- [ ] `/settings/billing` shows **Upgrade to Pro** and **Upgrade to Enterprise**.
- [ ] Pressing Upgrade **redirects to `https://checkout.bachs.io/…`** (no "No Bachs product configured" error, no 500).
      **Check the host**: production must land on the live checkout host, staging on the sandbox one. A staging click that
      reaches the live host is a configuration bug, and a production click that reaches the sandbox host is a key that will
      never charge.

If the button errors instead of redirecting, `journalctl -u ultraos-web.service -n 50 | grep -i bachs` names the scope or the
product id that is wrong. Do not proceed to the payment until the redirect works.

---

## 7. Prove it with a real payment (**YOU**, ~10 min)

The sandbox and live environments have diverged before; a sandbox success is not evidence about live. **Do not skip this.**

1. `/settings/billing` → **Upgrade to Pro**.
2. Pay the **minimum charge** (₦100, or whatever the dashboard's minimum is) with **a real card you control**.
3. Verify in the app:
   - `/settings/billing` shows **PRO**.
   - The database has the event (read-only query):

     ```bash
     priv=$(sudo grep -m1 '^DATABASE_URL=' /opt/ultraleagueos/shared/migrate.env | cut -d= -f2- | cut -d'?' -f1)
     psql "$priv" -c "select name, plan from \"Organization\" order by name;"
     psql "$priv" -c "select to_char(\"createdAt\",'YYYY-MM-DD HH24:MI') as at, action, details
                      from \"AuditLog\" where action like '%BACHS%' order by \"createdAt\" desc limit 5;"
     ```

   - You should see `ORG_UPGRADED_BY_BACHS` with a **live** `bachsEventId` (the sandbox ids looked like `evt_v18_…`;
     a live id comes from the live event stream).
4. **Refund** the charge in the Bachs dashboard.
5. Verify the revert: the org returns to its previous plan, and the audit log shows `ORG_DOWNGRADED_BY_BACHS`.

**If the plan does not change**, the webhook is the suspect, not the checkout: the checkout redirect proves the key and
product id, and the webhook is what writes the plan. Check:

```bash
sudo journalctl -u ultraos-web.service --since "30 min ago" | grep -iE 'bachs|webhook' | tail -20
```

and the Bachs dashboard's event log for the delivery's HTTP response. A **400** means a signature mismatch (the secret in
the env does not match the one that signed); a **503** means the webhook is not configured at all
(`BACHS_WEBHOOK_SECRET` missing); a **200** means the app accepted it, and the problem is in the event's payload.

---

## 8. Rollback (~2 min)

Any failure in §6 or §7 is a rollback, not a debugging session on live credentials. It is a **single file copy**, because
everything the migration changes lives in that one env file:

| variable | restore to | note |
| --- | --- | --- |
| `BACH_IO` | the previous value (from the §4 backup) | the old key must still exist in the dashboard until the migration is confirmed — revoke only after §7 passes |
| `BACH_WEBHOOK` | the previous value | the dashboard roll cannot be undone, so after a roll both sides must agree again: if you roll back, either re-point the app at the new secret or expect 400s |
| `BACHS_WEBHOOK_SECRET` | remove it if it was not there before | the app prefers this name over `BACH_WEBHOOK` |
| `BACHS_PRODUCT_PRO` | remove the line (it was absent) | absence is what produced "No Bachs product configured for PRO" |
| `BACHS_PRODUCT_ENTERPRISE` | remove the line | same |
| `BACHS_MOCK` | unchanged (absent) | — |

```bash
ssh raivstream
sudo cp /opt/ultraleagueos/shared/web.env.bak-<TS> /opt/ultraleagueos/shared/web.env   # the timestamp from §4
sudo chown root:root /opt/ultraleagueos/shared/web.env
sudo chmod 600 /opt/ultraleagueos/shared/web.env
sudo systemctl restart ultraos-web.service
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4110/api/v1/live
```

This restores the previous key, secret and (absent) product ids. The upgrade button returns to its previous behaviour —
including "No Bachs product configured for PRO" if that is where you started. Nothing else in the platform depends on the
Bachs variables: ticketing uses `BACH_IO` too, so confirm the ticketing flow still works after a rollback if it was live.

If the *database* needs rolling back as well (a wrong plan written by a test), restore the dump from §4 **into a scratch
database first** and compare before touching production; `LAUNCH_READY.md` §5 has the exact commands.

---

## 9. Post-migration checklist

- [ ] The old key is revoked in the dashboard, and the old webhook secret is gone from the dashboard's rotation history.
- [ ] `/settings/billing` shows no test-mode banner and both upgrade buttons redirect.
- [ ] A real payment upgraded the plan; the refund downgraded it; both are in `auditLog`.
- [ ] `session.md` records the event id (never the key) and the timestamp.
- [ ] Any other place that reads the old key is updated — see §10.
- [ ] The backup of the env file from §4 is kept for at least one release cycle.

---

## 10. Places the same credentials hide (easy to miss)

- **The nightly backup script does not use the Bachs key**, but it *does* read `DATABASE_URL` from the production env file:
  rotate a database password and the backup breaks silently unless `ultraos-backup.service` is checked afterwards. That is
  the step people forget — `ROTATE_SECRETS.md` §4 spells it out.
- **The vision stack** reads `/opt/ultraos-vision/vision.env`, which is a *copy* of the staging database URL plus R2
  credentials. It does not read the Bachs key, but it will keep a stale database password after a rotation.
- **`deploy/ops/install-feed-drain-timer.sh`** embeds `CRON_SECRET` in the systemd timer's `ExecStart`; rotating
  `CRON_SECRET` without re-running that script leaves the feed drain authenticating with the old value.
- **Any `.bak` file you created today** contains the previous key. Treat them as secrets: `chmod 600`, and delete them once
  the migration is confirmed.
- **This runbook, and every document, must contain placeholders only.** If you find a real key in a document, that is an
  incident: `ROTATE_SECRETS.md` §3 is the procedure.

---

## What NOT to do

1. **Never paste a secret into a document, a commit, a chat, or a tool transcript.** Reference the variable name
   (`BACH_IO`), never the value. A transcript is a log.
2. **Never use the sandbox key in production, or the live key on staging.** The SDK refuses a prefix/host mismatch, and the
   startup guard refuses a live key outside production — both exist because each has happened.
3. **Never skip the ₦100 proof payment.** The checkout redirect proves the key; only a real charge proves the webhook, and
   the webhook is what changes the plan.
4. **Never enable live keys before the webhook secret is rolled.** Otherwise the first live delivery is verified against a
   secret that has been in a repository, which is no verification at all.
5. **Never edit the env file with `echo` or a heredoc.** Shell history and command logs capture it. Use `nano`/`vim`.
6. **Never start the restart without §4's backup.** The env file is the only copy of the previous key in a usable form.
