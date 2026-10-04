import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('Verifying event update...\n');

  const event = await prisma.event.findUnique({
    where: { id: 'cmu2i5e9p0004plkkrnjhej0o' },
    include: {
      venue: true,
      registrationForms: {
        include: {
          fields: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      }
    }
  });

  if (!event) {
    console.error('Event not found!');
    return;
  }

  console.log('✓ Event Details:');
  console.log(`  Name: ${event.name}`);
  console.log(`  Date: ${event.date.toISOString().split('T')[0]}`);
  console.log(`  Start Time: ${event.startTime.toISOString()}`);
  console.log(`  End Time: ${event.endTime?.toISOString()}`);
  console.log(`  Venue: ${event.venue?.name}`);
  console.log(`  Venue Address: ${event.venue?.address}`);

  console.log('\n✓ Registration Form:');
  const form = event.registrationForms[0];
  if (form) {
    console.log(`  Title: ${form.title}`);
    console.log(`  Opens: ${form.opensAt?.toISOString().split('T')[0]}`);
    console.log(`  Closes: ${form.closesAt?.toISOString().split('T')[0]}`);
    console.log(`  Mode: ${form.mode}`);
    console.log(`  Sports: ${form.sports?.join(', ')}`);
    
    const sportConfig = form.sportConfig as any;
    if (sportConfig) {
      console.log(`  Gender: ${sportConfig.gender}`);
      console.log(`  Require Both Sports: ${sportConfig.requireBothSports}`);
      console.log(`  Coaches Required: ${sportConfig.coaches?.required}`);
      console.log(`  Coach Min/Max: ${sportConfig.coaches?.min}/${sportConfig.coaches?.max}`);
      
      console.log('\n  Volleyball Roster:');
      console.log(`    Min/Max: ${sportConfig.rosters?.VOLLEYBALL?.minRoster}/${sportConfig.rosters?.VOLLEYBALL?.maxRoster}`);
      console.log(`    Male: ${sportConfig.rosters?.VOLLEYBALL?.genderSplit?.male?.min}-${sportConfig.rosters?.VOLLEYBALL?.genderSplit?.male?.max}`);
      console.log(`    Female: ${sportConfig.rosters?.VOLLEYBALL?.genderSplit?.female?.min}-${sportConfig.rosters?.VOLLEYBALL?.genderSplit?.female?.max}`);
      
      console.log('\n  Flag Race Roster:');
      console.log(`    Min/Max: ${sportConfig.rosters?.FLAG_RACE?.minRoster}/${sportConfig.rosters?.FLAG_RACE?.maxRoster}`);
      console.log(`    Male: ${sportConfig.rosters?.FLAG_RACE?.genderSplit?.male?.min}-${sportConfig.rosters?.FLAG_RACE?.genderSplit?.male?.max}`);
      console.log(`    Female: ${sportConfig.rosters?.FLAG_RACE?.genderSplit?.female?.min}-${sportConfig.rosters?.FLAG_RACE?.genderSplit?.female?.max}`);
    }

    console.log('\n✓ Registration Fields:');
    const submissionFields = form.fields.filter(f => f.scope === 'SUBMISSION');
    const participantFields = form.fields.filter(f => f.scope === 'PARTICIPANT');
    
    console.log(`  Team/Coach Fields (${submissionFields.length}):`);
    submissionFields.forEach(f => {
      console.log(`    - ${f.label} (${f.type}, ${f.required ? 'required' : 'optional'})`);
    });
    
    console.log(`\n  Player Fields (${participantFields.length}):`);
    const volleyballFields = participantFields.filter(f => (f.options as any)?.sport === 'VOLLEYBALL');
    const flagRaceFields = participantFields.filter(f => (f.options as any)?.sport === 'FLAG_RACE');
    
    console.log(`    Volleyball (${volleyballFields.length} fields):`);
    volleyballFields.forEach(f => {
      console.log(`      - ${f.label} (${f.type})`);
    });
    
    console.log(`    Flag Race (${flagRaceFields.length} fields):`);
    flagRaceFields.forEach(f => {
      console.log(`      - ${f.label} (${f.type})`);
    });
  }

  console.log('\n✓ Verification complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
