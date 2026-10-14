import { prisma } from '../src/lib/prisma';
import { parseSportConfig } from '../src/lib/registration/sport-config';

// Sets the GIESM 2026 registration sport configuration:
//  - ages 10-20
//  - volleyball and flag race independent for teams (requireBothSports false)
//  - flag race also open to individual (no-team) registration
//  - guardian consent required only for under-18s
// Validated with the runtime schema (parseSportConfig) before writing. Idempotent.
const FORM_ID = 'cmu2i5eal0005plkkwj1fsc5e';

const sportConfig = {
  gender: 'ANY',
  sports: ['VOLLEYBALL', 'FLAG_RACE'],
  individualSports: ['FLAG_RACE'],
  requireBothSports: false,
  dualParticipationAllowed: true,
  minAge: 10,
  maxAge: 20,
  requireGuardianConsent: true,
  guardianConsentUnderAge: 18,
  requireCompleteRosters: true,
  rosters: {
    VOLLEYBALL: { minRoster: 10, maxRoster: 20, activeCount: 12, substitutesAllowed: true, orderRequired: false },
    FLAG_RACE: { minRoster: 5, maxRoster: 10, activeCount: 10, substitutesAllowed: false, orderRequired: true },
  },
};

async function main() {
  const form = await prisma.registrationForm.findUnique({ where: { id: FORM_ID }, select: { id: true, title: true, sportConfig: true } });
  if (!form) throw new Error('GIESM registration form not found');
  console.log('Before:', JSON.stringify(form.sportConfig));
  parseSportConfig(sportConfig); // fail fast if invalid
  await prisma.registrationForm.update({ where: { id: form.id }, data: { sportConfig: sportConfig as never } });
  console.log('After: ', JSON.stringify(sportConfig));
  console.log('GIESM sportConfig updated and validated.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
