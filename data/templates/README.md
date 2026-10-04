# Registration Form Templates

This directory contains reusable registration form templates for common tournament types.

## Available Templates

### volleyball-flagrace-championship.json

**Use case:** Co-ed volleyball and flag race championships with team registration

**Features:**
- Team-based registration (one coach registers the whole team)
- Two sports: Volleyball and Flag Race
- Gender-split rosters (male/female)
- Coach information (head coach + assistant coach)
- Player details with sport-specific fields

**Configuration:**
- **Volleyball:** 10-20 players (5-10 male, 5-10 female)
- **Flag Race:** 5-10 players (0-5 male, 0-5 female)
- **Coaches:** 1-2 required
- **Fields:**
  - Team level: Head coach info, assistant coach info, team name
  - Volleyball players: Name, jersey number, email, phone, gender, DOB
  - Flag Race players: Name, email, phone, gender, DOB

## How to Use

### 1. Apply Template to an Event

```bash
# On production server
cd /opt/ultraleagueos/current/web
source /opt/ultraleagueos/shared/web.env

npx tsx scripts/apply-registration-template.ts <eventId> data/templates/volleyball-flagrace-championship.json
```

### 2. Update Event Details

After applying the template, update the event-specific details:

```typescript
// Update event dates, venue, times
await prisma.event.update({
  where: { id: eventId },
  data: {
    name: 'Your Tournament Name',
    date: new Date('2026-10-22'),
    startTime: new Date('2026-10-22T09:00:00Z'),
    endTime: new Date('2026-10-23T18:00:00Z'),
    venueId: venue.id
  }
});

// Update registration dates
await prisma.registrationForm.update({
  where: { id: formId },
  data: {
    opensAt: new Date('2026-10-04'),
    closesAt: new Date('2026-10-17'),
    status: 'OPEN',
    publicEnabled: true
  }
});
```

### 3. Customize as Needed

You can modify the template JSON before applying it:
- Change roster sizes
- Add/remove sports
- Adjust field requirements
- Modify gender splits

## Creating New Templates

To create a new template:

1. **Copy an existing template** as a starting point
2. **Modify the sportConfig** to match your tournament requirements
3. **Adjust the fields** array to include the necessary information
4. **Test the template** by applying it to a test event

### Template Structure

```json
{
  "name": "Template Name",
  "description": "Template description",
  "sportConfig": {
    "gender": "CO_ED|MALE|FEMALE",
    "sports": ["SPORT1", "SPORT2"],
    "rosters": {
      "SPORT1": {
        "minRoster": 10,
        "maxRoster": 20,
        "genderSplit": {
          "male": { "min": 5, "max": 10 },
          "female": { "min": 5, "max": 10 }
        }
      }
    },
    "coaches": {
      "required": true,
      "min": 1,
      "max": 2
    }
  },
  "fields": {
    "submission": [
      // Team-level fields (coaches, team info)
    ],
    "participant": {
      "SPORT1": [
        // Player fields for SPORT1
      ],
      "SPORT2": [
        // Player fields for SPORT2
      ]
    }
  }
}
```

## Field Types

Available field types:
- `TEXT` - Single-line text input
- `TEXTAREA` - Multi-line text input
- `EMAIL` - Email address with validation
- `PHONE` - Phone number
- `NUMBER` - Numeric input
- `DATE` - Date picker
- `SELECT` - Dropdown with choices
- `MULTISELECT` - Multiple selection dropdown
- `CHECKBOX` - Checkbox input
- `CONSENT` - Consent/checkbox with label

## Field Scopes

- `SUBMISSION` - Team-level fields (one value per registration)
- `PARTICIPANT` - Player-level fields (one value per player per sport)

## Examples

### Single-Sport Tournament

Remove the second sport from `sportConfig.sports` and delete its participant fields.

### Individual Registration

Change `mode` from `TEAM` to `INDIVIDUAL` and remove team-level fields.

### Age-Restricted Tournament

Add age validation to the `dateOfBirth` field:

```json
{
  "key": "dateOfBirth",
  "label": "Date of Birth",
  "type": "DATE",
  "required": true,
  "validation": {
    "minAge": 10,
    "maxAge": 18
  }
}
```

## Maintenance

When creating new templates:
1. Follow the existing naming convention: `<sport1>-<sport2>-<type>.json`
2. Include comprehensive descriptions
3. Test the template on a staging environment first
4. Document any special requirements or constraints

## Support

For questions or to request new template types, contact the development team.
