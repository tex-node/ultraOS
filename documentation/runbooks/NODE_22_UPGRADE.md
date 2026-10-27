# Runbook: upgrade the VPS from Node 20 to Node 22

**Status:** tested on staging 2026-10-27 · **Host:** vmi3208643 (6 vCPU, 11 GB RAM) · **Not yet applied to the running
services** — the side-by-side install is in place at `/opt/node22` and everything below was measured against it.

## Why

`next@16.2.9` declares `"node": "^22.22.2 || ^24.15.0 || >=26.0.0"`. The host runs **v20.20.2** from the NodeSource apt
package, so:

- `npm ci` prints `EBADENGINE` on every install,
- **`npm run test:component` cannot run at all** — jsdom pulls in undici, which throws constructing `CacheStorage` on
  Node 20. The suite exits with an actionable message (streak v20) instead of pretending, but it means 26 component tests
  never execute on the machine that deploys.

## What was measured under Node 22.22.2 (on staging, against a copy of the source)

| Step | Node 20 (today) | Node 22.22.2 (measured) |
| --- | --- | --- |
| `npm ci` | succeeds with `EBADENGINE` warnings | **731 packages in 20 s**, no engine warnings |
| `npm test` (unit) | 1022 collected · 1021 pass · 1 skip | **same: 1022 · 1021 pass · 1 skip · 0 fail** |
| `npm run test:component` | **cannot run** | **26 tests · 26 pass · 0 fail** |
| `next build` | works (heap raised to 6 GB in v21) | **212 s wall · 4.97 GB peak RSS** |
| `next start` + HTTP | — | `/api/v1/live` 200 · `/` 200 · `/api-docs` 200 · 0 error lines |

The build's peak RSS matters: 4.97 GB against the deploy script's `--max-old-space-size=6144`. On a 11 GB host with
staging *and* production building in sequence, that is the tightest constraint in this upgrade, not the tests.

## Procedure (side-by-side, reversible)

The install is deliberately **not** over `/usr/bin/node`: overwriting the package-manager Node restarts-under-services
risk for both environments at once, with no way back except a reinstall.

### 0. Pre-flight

```bash
node --version                     # expect v20.x before the switch
systemctl is-active ultraos-web.service ultraos-staging-web.service
ls -l /opt/ultraos-staging/current /opt/ultraleagueos/current
```

### 1. Install Node 22 next to it (done — `/opt/node22`)

```bash
VER=v22.22.2; TARBALL=node-${VER}-linux-x64.tar.xz
mkdir -p /opt/node22 /tmp/node22-dl && cd /tmp/node22-dl
curl -fsSLO https://nodejs.org/dist/${VER}/${TARBALL}
curl -fsSL https://nodejs.org/dist/${VER}/SHASUMS256.txt -o SHASUMS256.txt
grep " ${TARBALL}\$" SHASUMS256.txt | sha256sum -c -        # must print OK
tar -xJf ${TARBALL} -C /opt/node22 --strip-components=1
/opt/node22/bin/node --version                              # v22.22.2
```

### 2. Prove it in a copy, never in the live tree

```bash
rm -rf /tmp/node22-check && mkdir -p /tmp/node22-check
cd /opt/ultraos-staging/source && tar -cf - web | tar -xf - -C /tmp/node22-check
cd /tmp/node22-check/web && export PATH=/opt/node22/bin:$PATH
npm ci --no-audit --no-fund
npm test && npm run test:component
NODE_OPTIONS=--max-old-space-size=6144 npx next build
npx next start --hostname 127.0.0.1 --port 4177 &   # then curl /api/v1/live and /, kill it
```

### 3. Switch the services (staging first, one at a time)

`ExecStart` currently calls `/usr/bin/npm start`. Two options:

**A — point the unit at the new Node (recommended, smallest blast radius):**

```bash
sudo systemctl edit ultraos-staging-web.service
# [Service]
# Environment=PATH=/opt/node22/bin:/usr/local/bin:/usr/bin:/bin
# ExecStart=
# ExecStart=/opt/node22/bin/npm start -- --hostname 127.0.0.1 --port 4120
sudo systemctl daemon-reload && sudo systemctl restart ultraos-staging-web.service
bash /root/smoke-test.sh
```

**B — make Node 22 the system default** (what the runbook would do for a fresh host):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs    # replaces the nodejs apt package
node --version && npm --version
```

Option B changes `/usr/bin/node`, which **both** services and the deploy script use. Do it in a maintenance window, and
restart both units afterwards.

### 4. Verify

```bash
node --version                       # v22.22.2
cd /opt/ultraos-staging/source/web && npm test && npm run test:component
bash /root/deploy.sh --app-root /opt/ultraos-staging --service ultraos-staging-web.service \
  --env-file /opt/ultraos-staging/shared/web.env --ref origin/main   # npm ci now runs without EBADENGINE
bash /root/smoke-test.sh
```

### 5. Rollback

```bash
sudo systemctl revert ultraos-staging-web.service     # undoes `systemctl edit`
sudo systemctl daemon-reload && sudo systemctl restart ultraos-staging-web.service
```

With option B: `sudo apt-get install --allow-downgrades nodejs=20.20.2-1nodesource1`. The `/opt/node22` install can stay
in place forever — it is 120 MB and touches nothing.

## Risk assessment

| Risk | Assessment | Mitigation |
| --- | --- | --- |
| **Build memory** | `next build` peaked at **4.97 GB** under Node 22. The deploy script allows 6 GB; the host has 11 GB total and both environments can build in sequence. | Do not build staging and production concurrently. Consider `--max-old-space-size=7168` if a build ever OOMs. |
| `npm ci` and the lock file | Clean on Node 22 (731 packages, 20 s). The v17/v18 lock trouble was Windows-vs-Linux resolution, not Node version. | The lock is unchanged by the upgrade; re-run `npm ci` once and watch for `EBADENGINE` disappearing. |
| Native modules | `sharp` and `@prisma/client` ship prebuilt binaries resolved by platform, not by Node ABI, and both installed without compiling. `bcryptjs` is pure JS. | If a module ever needs a rebuild: `npm rebuild sharp` under the new Node. |
| The Prisma engine | Prisma 7's client is Node-API based and version-agnostic here; `prisma generate` ran under Node 22 during the build. | `npm run db:generate` is part of the deploy; watch its output on the first deploy after the switch. |
| systemd PATH | A unit's `PATH` is fixed at start time; a swapped `/usr/bin/node` needs a restart to take effect. | Option A sets `PATH` explicitly in the unit; either way, restart and run the smoke test. |
| The deploy script | `deploy.sh` calls `npx next build` and `npm ci` through `PATH`. | Nothing to change for option B; option A needs `PATH` in the unit *and* in the shell that runs `deploy.sh`. |
| **Node 20-only dependencies** | None found: package.json declares no `engines` floor of its own, and every direct dependency installed and ran under 22. | The suites are the check: 1022 unit + 26 component + 49 DB. |

## What is still not done

The host **still runs Node 20**. This runbook proves the upgrade works; flipping the switch is a maintenance-window
decision because it restarts both services. Until then:

- `npm run test:component` exits 2 on the host with its explanation (by design, streak v20),
- every `npm ci` prints `EBADENGINE`,
- `/opt/node22` sits unused.
