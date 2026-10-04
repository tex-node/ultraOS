import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('Starting event update...\n');

  // Step 1: Find or create the Indoor Hall venue
  let venue = await prisma.venue.findFirst({
    where: {
      organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
      name: { contains: 'Indoor Hall', mode: 'insensitive' }
    }
  });

  if (!venue) {
    console.log('Creating Indoor Hall National Stadium Surulere venue...');
    venue = await prisma.venue.create({
      data: {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        name: 'Indoor Hall, National Stadium Surulere',
        address: 'National Stadium, Surulere, Lagos',
        city: 'Lagos',
        capacity: 5000,
        contactPerson: 'League Operations'
      }
    });
    console.log(`Created venue: ${venue.id}\n`);
  } else {
    console.log(`Using existing venue: ${venue.id}\n`);
  }

  // Step 2: Update the event
  console.log('Updating event...');
  const event = await prisma.event.update({
    where: { id: 'cmu2i5e9p0004plkkrnjhej0o' },
    data: {
      name: 'GIESM 2026 Volleyball & Flag Race Championship',
      date: new Date('2026-10-22T00:00:00.000Z'),
      startTime: new Date('2026-10-22T09:00:00.000Z'),
      endTime: new Date('2026-10-23T18:00:00.000Z'),
      venueId: venue.id
    }
  });
  console.log(`Updated event: ${event.name}\n`);

  // Step 3: Update the registration form
  console.log('Updating registration form...');
  const registrationForm = await prisma.registrationForm.update({
    where: { id: 'cmu2i5eal0005plkkwj1fsc5e' },
    data: {
      title: 'GIESM 2026 Championship — Team Registration',
      description: 'Register your team for the GIESM 2026 Volleyball & Flag Race Championship.\n\nTournament Dates: October 22-23, 2026\nVenue: Indoor Hall, National Stadium Surulere\nRegistration: October 4-17, 2026\n\nVolleyball: 10 male + 10 female players (minimum 5 per gender)\nFlag Race: Maximum 10 athletes (5 male + 5 female)',
      opensAt: new Date('2026-10-04T00:00:00.000Z'),
      closesAt: new Date('2026-10-17T23:59:59.000Z'),
      mode: 'TEAM',
      sportConfig: {
        gender: 'CO_ED',
        sports: ['VOLLEYBALL', 'FLAG_RACE'],
        requireBothSports: true,
        requireCompleteRosters: true,
        requireGuardianConsent: false,
        dualParticipationAllowed: true,
        rosters: {
          VOLLEYBALL: {
            minRoster: 10,
            maxRoster: 20,
            activeCount: 12,
            orderRequired: false,
            substitutesAllowed: true,
            genderSplit: {
              male: { min: 5, max: 10 },
              female: { min: 5, max: 10 }
            }
          },
          FLAG_RACE: {
            minRoster: 5,
            maxRoster: 10,
            activeCount: 10,
            orderRequired: true,
            substitutesAllowed: false,
            genderSplit: {
              male: { min: 0, max: 5 },
              female: { min: 0, max: 5 }
            }
          }
        },
        coaches: {
          required: true,
          min: 1,
          max: 2
        }
      }
    }
  });
  console.log(`Updated registration form: ${registrationForm.title}\n`);

  // Step 4: Delete existing fields and create new ones
  console.log('Updating registration form fields...');
  await prisma.registrationField.deleteMany({
    where: { formId: registrationForm.id }
  });

  // Coach fields (SUBMISSION scope - team level)
  await prisma.registrationField.createMany({
    data: [
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'headCoachName',
        label: 'Head Coach Name',
        type: 'TEXT',
        scope: 'SUBMISSION',
        required: true,
        sortOrder: 1
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'headCoachEmail',
        label: 'Head Coach Email',
        type: 'EMAIL',
        scope: 'SUBMISSION',
        required: true,
        sortOrder: 2
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'headCoachPhone',
        label: 'Head Coach Phone',
        type: 'PHONE',
        scope: 'SUBMISSION',
        required: true,
        sortOrder: 3
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'assistantCoachName',
        label: 'Assistant Coach Name',
        type: 'TEXT',
        scope: 'SUBMISSION',
        required: true,
        sortOrder: 4
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'assistantCoachEmail',
        label: 'Assistant Coach Email',
        type: 'EMAIL',
        scope: 'SUBMISSION',
        required: false,
        sortOrder: 5
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'assistantCoachPhone',
        label: 'Assistant Coach Phone',
        type: 'PHONE',
        scope: 'SUBMISSION',
        required: false,
        sortOrder: 6
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'teamName',
        label: 'Team Name',
        type: 'TEXT',
        scope: 'SUBMISSION',
        required: true,
        sortOrder: 10
      }
    ]
  });

  // Volleyball player fields (PARTICIPANT scope - player level)
  await prisma.registrationField.createMany({
    data: [
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'volleyball_playerName',
        label: 'Player Name (Volleyball)',
        type: 'TEXT',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 20,
        options: { sport: 'VOLLEYBALL' }
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'volleyball_jerseyNumber',
        label: 'Jersey Number (Volleyball)',
        type: 'TEXT',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 21,
        options: { sport: 'VOLLEYBALL' }
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'volleyball_email',
        label: 'Email (Volleyball)',
        type: 'EMAIL',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 22,
        options: { sport: 'VOLLEYBALL' }
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'volleyball_phone',
        label: 'Phone Number (Volleyball)',
        type: 'PHONE',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 23,
        options: { sport: 'VOLLEYBALL' }
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'volleyball_gender',
        label: 'Gender (Volleyball)',
        type: 'SELECT',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 24,
        options: { sport: 'VOLLEYBALL', choices: ['MALE', 'FEMALE'] }
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'volleyball_dateOfBirth',
        label: 'Date of Birth (Volleyball)',
        type: 'DATE',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 25,
        options: { sport: 'VOLLEYBALL' }
      }
    ]
  });

  // Flag Race player fields (PARTICIPANT scope - player level)
  await prisma.registrationField.createMany({
    data: [
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'flagrace_playerName',
        label: 'Player Name (Flag Race)',
        type: 'TEXT',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 30,
        options: { sport: 'FLAG_RACE' }
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'flagrace_email',
        label: 'Email (Flag Race)',
        type: 'EMAIL',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 31,
        options: { sport: 'FLAG_RACE' }
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'flagrace_phone',
        label: 'Phone Number (Flag Race)',
        type: 'PHONE',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 32,
        options: { sport: 'FLAG_RACE' }
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'flagrace_gender',
        label: 'Gender (Flag Race)',
        type: 'SELECT',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 33,
        options: { sport: 'FLAG_RACE', choices: ['MALE', 'FEMALE'] }
      },
      {
        organizationId: 'cmt4odhgn0000wokk8fbwr6ro',
        formId: registrationForm.id,
        key: 'flagrace_dateOfBirth',
        label: 'Date of Birth (Flag Race)',
        type: 'DATE',
        scope: 'PARTICIPANT',
        required: true,
        sortOrder: 34,
        options: { sport: 'FLAG_RACE' }
      }
    ]
  });

  console.log('Created all registration fields\n');

  // Step 5: Create a template for future reuse
  console.log('Creating reusable template...');
  const template = {
    name: 'Volleyball & Flag Race Team Championship',
    description: 'Template for co-ed volleyball and flag race championships with team registration',
    sportConfig: registrationForm.sportConfig,
    fieldStructure: {
      coachFields: 6,
      teamFields: 1,
      playerFieldsPerSport: {
        VOLLEYBALL: ['playerName', 'jerseyNumber', 'email', 'phone', 'gender', 'dateOfBirth'],
        FLAG_RACE: ['playerName', 'email', 'phone', 'gender', 'dateOfBirth']
      }
    },
    dates: {
      registrationWindow: { daysBeforeEvent: 18, duration: 14 }
    },
    venue: 'Indoor Hall, National Stadium Surulere'
  };

  console.log('\nTemplate configuration:');
  console.log(JSON.stringify(template, null, 2));

  console.log('\n✓ Event update complete!');
  console.log(`Event: ${event.name}`);
  console.log(`Dates: October 22-23, 2026`);
  console.log(`Venue: ${venue.name}`);
  console.log(`Registration: October 4-17, 2026`);
  console.log(`Form: ${registrationForm.title}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
