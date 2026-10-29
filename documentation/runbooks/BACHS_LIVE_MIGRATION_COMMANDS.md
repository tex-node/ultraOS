# Bachs live migration — the commands

**Read `BACHS_LIVE_MIGRATION.md` first.** This page is only the execution block for someone who already knows why each step
exists. One SSH session, ~30 minutes, of which ~15 are dashboard actions.

Replace every `<PLACEHOLDER>` from the Bachs dashboard. **Do not paste a real key into this file, a shell history you keep,
or a chat.**

---

## STEP 0 — Dashboard pre-flight (~10 min, browser)

- [ ] Live API key created **with the scopes `payments:write` and `products:read`** — a key that authenticates but lacks
      `payments:write` fails the first real action with
      `API key missing required scope: payments:write` (this is what blocks staging today).
- [ ] **Webhook signing secret rolled** (Webhooks → the endpoint pointing at the app → Roll signing secret). Without this the
      payment succeeds and the app never learns about it: `Organization.plan` stays where it is.
- [ ] The old key (`sk_live_…` with prefix `sk_live_b8e`) **revoked** — it has lived in `cred/` since v22.
- [ ] Products exist and their ids are copied:
      PRO `prod_a2588c7531b24b27ace2`, ENTERPRISE `prod_0cf8f25781df468ebd99`.

> The **TEST** product `prod_582d912f93cf444cb827` is **staging only**. It must never appear in a production env file: a live
> account that points at the test product either fails to charge or charges the wrong thing.

---

## STEP 1 — Backup production's env (~1 min)

```bash
ssh raivstream
TS=$(date -u +%Y%m%dT%H%M%SZ)
sudo cp /opt/ultraleagueos/shared/web.env "/opt/ultraleagueos/shared/web.env.bak-$TS"
sudo chmod 600 "/opt/ultraleagueos/shared/web.env.bak-$TS"
echo "env backup: /opt/ultraleagueos/shared/web.env.bak-$TS"
```

## STEP 2 — Backup the database (~2 min)

```bash
sudo docker exec ultraos-postgres pg_dump -U ultraos -Fc -d ultraleagueos \
  > "/var/backups/ultraleagueos-production/pre-bachs-live-$TS.dump"
sudo sha256sum "/var/backups/ultraleagueos-production/pre-bachs-live-$TS.dump"
sudo ls -lh /var/backups/ultraleagueos-production/ | tail -3
```

## STEP 3 — Edit the env (~3 min)

```bash
sudo nano /opt/ultraleagueos/shared/web.env
```

Set these four lines (the app reads the **legacy** names `BACH_IO` / `BACH_WEBHOOK` — `BACHS_KEY` / `BACHS_WEBHOOK_SECRET`
also work, because `src/lib/bachs.ts` reads both; pick one pair and be consistent):

```ini
BACH_IO=<NEW_LIVE_KEY>                 # sk_live_… from STEP 0
BACH_WEBHOOK=<NEW_WEBHOOK_SECRET>      # whsec_… from STEP 0
BACHS_PRODUCT_PRO=prod_a2588c7531b24b27ace2
BACHS_PRODUCT_ENTERPRISE=prod_0cf8f25781df468ebd99
```

Remove, if present: `BACHS_MOCK=1` (production has never had it set, so this is a no-op check).

**Do not add `BACHS_API_BASE` or change `BACH_API_BASE`.** The SDK derives the host from the key prefix and refuses a
mismatch; v24 lost an afternoon to exactly that (`401 Invalid API key`).

Verify the edit with values redacted:

```bash
sudo grep -E '^(BACH_IO|BACH_WEBHOOK|BACHS_WEBHOOK_SECRET|BACHS_PRODUCT_PRO|BACHS_PRODUCT_ENTERPRISE|BACHS_MOCK)=' \
  /opt/ultraleagueos/shared/web.env | sed -E 's/(sk_live_|whsec_)[A-Za-z0-9_-]+/\1***/'
```

## STEP 4 — Restart and check the wiring (~1 min)

```bash
sudo systemctl restart ultraos-web.service
sleep 3
systemctl is-active ultraos-web.service
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4110/api/v1/live     # expect 200
```

`/api/health` is **404** on this deployment — use `/api/v1/live`. If the service is `failed`, read
`journalctl -u ultraos-web.service -n 50`.

## STEP 5 — Prove the checkout opens (~2 min, browser)

1. Open `https://app.neonultra.ng/settings/billing`, signed in as `texdevices@gmail.com`.
2. No "Test mode" banner.
3. Click **Upgrade to Pro** → you are redirected to `https://checkout.bachs.io/…` (the **live** host — a staging click would
   land on the sandbox host instead; that difference is the check).
4. If the button reports *"No Bachs product configured for PRO"*, STEP 3 did not take effect (restart it again).
   If it reports a scope error, the key is wrong — go back to STEP 0.

## STEP 6 — Pay ₦100 and prove the app knows (~5 min, browser + SQL)

Pay the minimum with a real card you control. Then:

```bash
sudo docker exec -i ultraos-postgres psql -U ultraos -d ultraleagueos -c \
  "SELECT action, \"createdAt\" FROM \"AuditLog\" WHERE action LIKE '%BACHS%' ORDER BY \"createdAt\" DESC LIMIT 3;"
```

Expect `ORG_UPGRADED_BY_BACHS`. Also check the plan itself:

```bash
sudo docker exec -i ultraos-postgres psql -U ultraos -d ultraleagueos -c \
  "SELECT name, plan, \"bachsCustomerId\" IS NOT NULL AS has_bachs_customer FROM \"Organization\" ORDER BY name;"
```

**A redirect alone is not a pass.** The redirect proves the card was charged; the audit row proves the webhook delivered and
the plan changed. If the payment went through and the plan did not change, the webhook secret is the suspect:

```bash
sudo journalctl -u ultraos-web.service --since "30 min ago" | grep -iE 'bachs|webhook' | tail -20
# 400 = signature mismatch (secret in env ≠ secret in dashboard)
# 503 = no secret configured at all
# 200 = accepted; the problem is the event payload
```

## STEP 7 — Refund and prove the downgrade (~3 min)

Refund in the Bachs dashboard, then re-run the audit query from STEP 6.

Expect `ORG_DOWNGRADED_BY_BACHS`. Both directions matter: an upgrade that cannot be reversed is a refund you cannot honour.

## STEP 8 — Rollback (only if something fails)

```bash
sudo cp /opt/ultraleagueos/shared/web.env.bak-<TS> /opt/ultraleagueos/shared/web.env
sudo chown root:root /opt/ultraleagueos/shared/web.env
sudo chmod 600 /opt/ultraleagueos/shared/web.env
sudo systemctl restart ultraos-web.service
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4110/api/v1/live
```

`<TS>` is the timestamp STEP 1 printed. The previous key, secret and absent product ids all come back in one edit; the
upgrade button returns to its previous behaviour (including *"No Bachs product configured for PRO"* if that is where you
started). If a test payment wrote a wrong plan, restore the dump from STEP 2 **into a scratch database first** —
`LAUNCH_READY.md` §5 has the commands.

---

## What you should be looking at when you are done

| check | expected |
| --- | --- |
| `web.env` mtime | today |
| `BACH_IO` prefix | `sk_live_` (not `sk_live_b8e`) |
| `BACH_WEBHOOK` hash | **different** from the one in `cred/gateway_env.txt` |
| `BACHS_PRODUCT_PRO` / `_ENTERPRISE` | present, the two ids above |
| `BACHS_MOCK` | absent |
| `/settings/billing` | no test banner; both upgrade buttons redirect to `checkout.bachs.io` |
| `auditLog` | one `ORG_UPGRADED_BY_BACHS` **and** one `ORG_DOWNGRADED_BY_BACHS` from your test |
| `Organization.bachsCustomerId` | non-null for the org you tested |
