---
title: GIESM 2026 Registration Setup
status: Ready to run
version: giesm-1.0
last_updated: 2026-09-13
---

# GIESM 2026 Volleyball Championship — Registration Setup

The public team-registration page for the **GIESM 2026 Volleyball Championship** (Volleyball +
Flag Race) is served at:

- short link: `/giesm`  (e.g. `https://app.neonultra.ng/giesm`)
- canonical: `/register/neon-ultra/giesm`

The short link is defined in `web/src/lib/public-short-links.ts` (`PUBLIC_SHORT_LINKS.giesm` →
organization `neon-ultra`, event slug `giesm`). This is the single source of truth; add future short
links there.

## 1. Create the data (required — the page 404s until it exists)

The page resolves `Event.slug = giesm` (status `PUBLISHED`) with a `publicEnabled`, `OPEN`
registration form. Create it idempotently:

```bash
cd web
npm run giesm:setup                 # dry-run, prints what it would create
npm run giesm:setup -- --apply      # create venue/competition/season/event/form
```

Optional overrides:

```bash
npm run giesm:setup -- --apply --date 2026-08-15 --venue-name "Main Court" --venue-city Lagos
```

What the script finds-or-creates (never duplicates):

| Object | Key | Notes |
| --- | --- | --- |
| `Sport` | slug `volleyball` | global catalog row |
| `Venue` | `--venue-name`, else the organization's first venue | else creates a placeholder |
| `Competition` | org + slug `giesm-2026` | sport = volleyball; name = the event name |
| `Season` | competition + name `2026` | dates from `--date` / `--season-end` |
| `Division` | competition + `all-female` | optional grouping |
| `Event` | org + slug `giesm` | name "GIESM 2026 Volleyball Championship", status `PUBLISHED` |
| `RegistrationForm` | the event | mode `TEAM`, sports `[VOLLEYBALL, FLAG_RACE]`, all-female preset config, status `OPEN`, `publicEnabled` |

## 2. Requirements

- The **event-registration tables** (`RegistrationForm`/`RegistrationField`/
  `RegistrationSubmission`/`RegistrationParticipant`/`RegistrationParticipantSport`) and
  `Event.slug` must exist. These are applied on **staging**; production requires the event
  registration migrations first (`STAGE_EVENT_REGISTRATION_STAGING_MIGRATION_RUNBOOK.md`).
- The target organization must be `ACTIVE` (default `neon-ultra`).
- The multi-sport migrations (Stages 1.3–7) are **not** required for this page — it uses only the
  existing registration schema.

## 3. Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.neonultra.ng/giesm   # 200 once set up
```

An operator with the admin role can then review submissions at `/registrations` and
`/events/[id]/registration`.

## 4. Posting a new season

`Season.name` is the only thing to change for a new year: re-run with `--season "2027"` and the
script adds a new season rather than duplicating the competition. The short link keeps working.

## After the event: the same link shows the results (v33)

`/giesm` used to be registration only, because the registration experience requires a `PUBLISHED` event with an `OPEN`
public form. That made the brand link 404 the moment the event moved to `COMPLETED` — exactly when people want the podium.

The page is now durable, in this order:

1. **registration**, while a public form is accepting entries (unchanged behaviour);
2. **the finished event's published results** — team standings by gender, individual flag-race podium with bibs, medals and
   notes, from `Event.results` (see `src/lib/public/event-results.ts`);
3. **"Results not published yet"** for a real event with nothing published, instead of a 404.

The same `EventResultsBoard` renders `/giesm`, `/public/events/<locator>` and `/t/<org>/<competition>`, so the three surfaces
cannot disagree about the same payload.

### Publishing or correcting results

`Event.results` is editorial JSON. The GIESM 2026 payload is maintained by:

```bash
cd web
npx tsx scripts/giesm-2026-flagrace-closeout.ts --organization <orgId>            # dry run
npx tsx scripts/giesm-2026-flagrace-closeout.ts --organization <orgId> --apply    # write
```

It is idempotent and does two things: it onboards the venue walk-ups as `INDIVIDUAL` flag-race entrants (bib stored as
`seed`, one division per gender, competition `GIESM 2026 Flag Race`), and it enriches the published categories with the bibs
it can substantiate plus an honest note about what the venue did not record (finish times). It never invents a time or a bib:
a placement without one says so.