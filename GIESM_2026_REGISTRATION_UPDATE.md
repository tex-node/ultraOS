# GIESM 2026 Registration Form Update - Summary

## What Was Done

Successfully updated the registration form at https://app.neonultra.ng/events/cmu2i5e9p0004plkkrnjhej0o/registration for the GIESM 2026 Volleyball & Flag Race Championship.

## Event Configuration

**Event Details:**
- **Name:** GIESM 2026 Volleyball & Flag Race Championship
- **Dates:** October 22-23, 2026
- **Venue:** Indoor Hall, National Stadium Surulere (new venue created)
- **Registration Period:** October 4-17, 2026

**Registration Type:**
- **Mode:** Team registration (coach registers the entire team)
- **Sports:** Volleyball + Flag Race (both required)
- **Gender:** Co-ed (both male and female players)

## Roster Requirements

### Volleyball
- **Total players:** 10-20 per team
- **Male players:** 5-10 (minimum 5)
- **Female players:** 5-10 (minimum 5)
- **Active players:** 12
- **Substitutes:** Allowed

### Flag Race
- **Total athletes:** 5-10 per team
- **Male athletes:** 0-5
- **Female athletes:** 0-5
- **Active athletes:** 10
- **Substitutes:** Not allowed

### Coaches
- **Required:** Yes (1-2 coaches per team)
- **Head coach:** Required (name, email, phone)
- **Assistant coach:** Required name, optional email/phone

## Registration Fields

### Team-Level Information (7 fields)
1. Head Coach Name (required)
2. Head Coach Email (required)
3. Head Coach Phone (required)
4. Assistant Coach Name (required)
5. Assistant Coach Email (optional)
6. Assistant Coach Phone (optional)
7. Team Name (required)

### Volleyball Players (6 fields per player)
1. Player Name (required)
2. Jersey Number (required)
3. Email (required)
4. Phone Number (required)
5. Gender (required - Male/Female)
6. Date of Birth (required)

### Flag Race Players (5 fields per player)
1. Player Name (required)
2. Email (required)
3. Phone Number (required)
4. Gender (required - Male/Female)
5. Date of Birth (required)

## Reusable Template System

Created a template system for future tournaments:

**Template File:**
- `data/templates/volleyball-flagrace-championship.json`

**Template Application Script:**
- `web/scripts/apply-registration-template.ts`

**Usage:**
```bash
# Apply template to a new event
npx tsx scripts/apply-registration-template.ts <eventId> data/templates/volleyball-flagrace-championship.json
```

**Documentation:**
- `data/templates/README.md` - Complete guide on using and creating templates

## Helper Scripts Created

1. **update-giesm-event.ts** - One-time update script for this specific event
2. **verify-event-update.ts** - Verification script to confirm all changes
3. **inspect-event.ts** - General event inspection utility
4. **apply-registration-template.ts** - Generic template application script

## Verification

All changes verified on production:
- ✓ Event updated with correct dates and venue
- ✓ Registration form configured with correct settings
- ✓ All 18 registration fields created
- ✓ Sport configuration applied (rosters, gender splits, coach requirements)
- ✓ Template JSON saved for future reuse
- ✓ Template application script tested

## Next Steps

The registration form is now ready for use. Coaches can:
1. Register their team during the October 4-17 window
2. Enter head coach and assistant coach information
3. Add volleyball players (10-20, with gender split)
4. Add flag race players (5-10, with gender split)
5. Submit the team registration

## Issue Resolution: 404 Error on Public Events Page

**Problem:** After updating the GIESM event, clicking on it from the public events page (https://app.neonultra.ng/public/events) resulted in a 404 error.

**Root Cause:** The event did not have a public resource locator entry in the database. Public events require a `PublicResourceLocator` record to be accessible via the public events page.

**Solution:** Created a public resource locator for the GIESM event:
- Public Key: `giesm-2026-13a3b800`
- Status: ACTIVE
- Public URL: https://app.neonultra.ng/public/events/giesm-2026-13a3b800

**Verification:**
- Event page now loads successfully (HTTP 200)
- Event appears in the public events listing
- Page displays correct event details (name, date, venue)

**Scripts Created:**
- `check-event-locator.ts` - Verify if an event has a public locator
- `create-event-locator.ts` - Create a public locator for an event
- `check-public-events-listing.ts` - List all active event locators

**For Future Events:**
When creating new events that should be publicly visible, ensure a public resource locator is created. Use the `create-event-locator.ts` script or create one manually in the `PublicResourceLocator` table.

## All Files Modified/Created

**Modified:**
- Event `cmu2i5e9p0004plkkrnjhej0o` in production database
- Registration form `cmu2i5eal0005plkkwj1fsc5e` in production database
- Venue: Created new venue `cmuu9wz0s0000odkkg9mod9go`
- PublicResourceLocator: Created locator `giesm-2026-13a3b800` for the event

**Created:**
- `data/templates/volleyball-flagrace-championship.json` - Reusable template config
- `data/templates/README.md` - Template usage documentation
- `web/scripts/apply-registration-template.ts` - Generic template application script
- `web/scripts/update-giesm-event.ts` - One-time update script
- `web/scripts/verify-event-update.ts` - Verification script
- `web/scripts/inspect-event.ts` - Event inspection utility
- `web/scripts/check-event-locator.ts` - Check event public locator
- `web/scripts/create-event-locator.ts` - Create event public locator
- `web/scripts/check-public-events-listing.ts` - List active event locators
- `GIESM_2026_REGISTRATION_UPDATE.md` - Complete summary document

**Production URLs:**
- Event page: https://app.neonultra.ng/public/events/giesm-2026-13a3b800
- Registration form: https://app.neonultra.ng/events/cmu2i5e9p0004plkkrnjhej0o/registration

## Files Modified/Created

**Modified:**
- Event `cmu2i5e9p0004plkkrnjhej0o` in production database
- Registration form `cmu2i5eal0005plkkwj1fsc5e` in production database
- Venue: Created new venue `cmuu9wz0s0000odkkg9mod9go`

**Created:**
- `data/templates/volleyball-flagrace-championship.json`
- `data/templates/README.md`
- `web/scripts/apply-registration-template.ts`
- `web/scripts/update-giesm-event.ts`
- `web/scripts/verify-event-update.ts`
- `web/scripts/inspect-event.ts`

**Committed:**
- `ee6f526` - feat: add GIESM 2026 volleyball & flag race registration template system
- `065b683` - docs: add session entry for GIESM 2026 registration template work

## How to Use This Template for Future Events

1. Create a new event in the system
2. Run the template application script with the event ID
3. Update event-specific details (dates, venue, registration window)
4. Enable the registration form (set status to OPEN, publicEnabled to true)

See `data/templates/README.md` for detailed instructions.
