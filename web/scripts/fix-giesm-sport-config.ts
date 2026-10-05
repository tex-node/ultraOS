import { prisma } from '../src/lib/prisma';
import { parseSportConfig } from '../src/lib/registration/sport-config';

// Repairs RegistrationForm.sportConfig for the GIESM event after a bad write used an invalid
// gender value ("CO_ED", not in FEMALE|MALE|ANY) and silently-dropped keys (genderSplit,
// coaches), which made the /giesm public registration route throw SportConfigError (500).
// Restores the supported schema: co-ed via gender "ANY", the original 6-12 age band, guardian
// consent, and valid per-sport rosters.
async function main() {
  const form = await prisma.registrationForm.findUnique({
    where: { id: 'cmu2i5eal0005plkkwj1fsc5e' },
    select: { id: true, title: true, sportConfig: true },
  });
  if (!form) throw new Error('Registration form not found');

  console.log('Before:', JSON.stringify(form.sportConfig, null, 2));

  const sportConfig = {
    gender: 'ANY',
    sports: ['VOLLEYBALL', 'FLAG_RACE'],
    minAge: 6,
    maxAge: 12,
    requireBothSports: true,
    requireCompleteRosters: true,
    requireGuardianConsent: true,
    dualParticipationAllowed: true,
    rosters: {
      VOLLEYBALL: {
        minRoster: 10,
        maxRoster: 20,
        activeCount: 12,
        orderRequired: false,
        substitutesAllowed: true,
      },
      FLAG_RACE: {
        minRoster: 5,
        maxRoster: 10,
        activeCount: 10,
        orderRequired: true,
        substitutesAllowed: false,
      },
    },
  };

  parseSportConfig(sportConfig); // fail fast if the repair is not schema-valid

  await prisma.registrationForm.update({
    where: { id: form.id },
    data: { sportConfig: sportConfig as never },
  });

  console.log('\nAfter:', JSON.stringify(sportConfig, null, 2));
  console.log('\nsportConfig repaired and validated against sportConfigSchema.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
