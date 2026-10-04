import { prisma } from '../src/lib/prisma';
import { readFileSync } from 'fs';

interface TemplateConfig {
  name: string;
  description: string;
  sportConfig: any;
  fields: {
    submission: any[];
    participant: {
      [sport: string]: any[];
    };
  };
  defaultSettings: any;
}

async function applyTemplate(eventId: string, templatePath: string) {
  console.log(`Applying template from: ${templatePath}`);
  console.log(`To event: ${eventId}\n`);

  // Load template
  const template: TemplateConfig = JSON.parse(readFileSync(templatePath, 'utf-8'));
  console.log(`Template: ${template.name}`);
  console.log(`Description: ${template.description}\n`);

  // Get event
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { registrationForms: true }
  });

  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  console.log(`Event: ${event.name}`);

  // Get or create registration form
  let form = event.registrationForms[0];
  if (!form) {
    console.log('\nCreating new registration form...');
    form = await prisma.registrationForm.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        title: `${event.name} — Registration`,
        description: template.description,
        mode: 'TEAM',
        status: 'DRAFT',
        publicEnabled: false,
        sports: template.sportConfig.sports,
        sportConfig: template.sportConfig
      }
    });
    console.log(`Created form: ${form.id}\n`);
  } else {
    console.log(`\nUpdating existing form: ${form.id}`);
    await prisma.registrationForm.update({
      where: { id: form.id },
      data: {
        title: `${event.name} — Registration`,
        description: template.description,
        sports: template.sportConfig.sports,
        sportConfig: template.sportConfig
      }
    });
  }

  // Delete existing fields
  console.log('Clearing existing fields...');
  await prisma.registrationField.deleteMany({
    where: { formId: form.id }
  });

  // Create submission-level fields (coach/team info)
  console.log(`Creating ${template.fields.submission.length} submission fields...`);
  await prisma.registrationField.createMany({
    data: template.fields.submission.map(field => ({
      organizationId: event.organizationId,
      formId: form.id,
      key: field.key,
      label: field.label,
      type: field.type,
      scope: 'SUBMISSION',
      required: field.required,
      sortOrder: field.sortOrder,
      options: field.options || null
    }))
  });

  // Create participant-level fields for each sport
  let participantFieldCount = 0;
  for (const [sport, fields] of Object.entries(template.fields.participant)) {
    console.log(`Creating ${fields.length} participant fields for ${sport}...`);
    await prisma.registrationField.createMany({
      data: fields.map(field => ({
        organizationId: event.organizationId,
        formId: form.id,
        key: field.key,
        label: field.label,
        type: field.type,
        scope: 'PARTICIPANT',
        required: field.required,
        sortOrder: field.sortOrder,
        options: { ...field.options, sport }
      }))
    });
    participantFieldCount += fields.length;
  }

  console.log(`\n✓ Template applied successfully!`);
  console.log(`  Submission fields: ${template.fields.submission.length}`);
  console.log(`  Participant fields: ${participantFieldCount}`);
  console.log(`  Total fields: ${template.fields.submission.length + participantFieldCount}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Update event dates and venue as needed`);
  console.log(`  2. Set registration opensAt/closesAt dates`);
  console.log(`  3. Enable the form: publicEnabled = true, status = 'OPEN'`);
}

// CLI usage
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: npx tsx scripts/apply-registration-template.ts <eventId> <templatePath>');
  console.log('\nExample:');
  console.log('  npx tsx scripts/apply-registration-template.ts cmu2i5e9p0004plkkrnjhej0o data/templates/volleyball-flagrace-championship.json');
  process.exit(1);
}

const eventId = args[0];
const templatePath = args[1];

applyTemplate(eventId, templatePath)
  .catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
