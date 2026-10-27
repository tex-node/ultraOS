

## Streak v21 (2026-10-27) - hardening and launch readiness

- **Test suites run where they are deployed.** `scripts/run-tests.mjs` enumerates files instead of passing quoted globs;
  the runner's path/glob contract differs between Node 20 and 22, and a Next dynamic segment (`[fixtureId]`) is either a
  real path or a character class depending on the version. Unit 1022 and DB 49 now run on the host; the component suite
  refuses with an explanation until the host moves to Node 22.
- **Node 22 is proven, not scheduled.** `/opt/node22` holds a checksum-verified install; on a copy of the staging tree
  `npm ci` is clean, the component suite passes 26/26, `next build` takes 212 s and peaks at 4.97 GB, and the built app
  serves 200. `documentation/runbooks/NODE_22_UPGRADE.md` records the switch and the rollback.
- **Browser tests exist for the three critical forms** (`web/e2e/`), run against the deployed build via `E2E_BASE_URL`.
  They found three defects: login-time organization resolution (RLS hid every non-default league's memberships, so
  `organizationId` was null for LBCL admins), the registration action reading the competition outside the tenant context,
  and a public form that only worked after hydration.
- **Staging is representative again**: two organizations, 11 competitions, and a cleanup script that discovers foreign-key
  order from the database rather than from a hand-written list.


## Streak v21 (2026-10-27) - hardening and launch readiness

- **Test suites run where they are deployed.** `scripts/run-tests.mjs` enumerates files instead of passing quoted globs;
  the runner's path/glob contract differs between Node 20 and 22, and a Next dynamic segment (`[fixtureId]`) is either a
  real path or a character class depending on the version. Unit 1022 and DB 49 now run on the host; the component suite
  refuses with an explanation until the host moves to Node 22.
- **Node 22 is proven, not scheduled.** `/opt/node22` holds a checksum-verified install; on a copy of the staging tree
  `npm ci` is clean, the component suite passes 26/26, `next build` takes 212 s and peaks at 4.97 GB, and the built app
  serves 200. `documentation/runbooks/NODE_22_UPGRADE.md` records the switch and the rollback.
- **Browser tests exist for the three critical forms** (`web/e2e/`), run against the deployed build via `E2E_BASE_URL`.
  They found three defects: login-time organization resolution (RLS hid every non-default league's memberships, so
  `organizationId` was null for LBCL admins), the registration action reading the competition outside the tenant context,
  and a public form that only worked after hydration.
- **Staging is representative again**: two organizations, 11 competitions, and a cleanup script that discovers foreign-key
  order from the database rather than from a hand-written list.
