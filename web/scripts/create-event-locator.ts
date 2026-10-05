import { prisma } from '../src/lib/prisma';
import { randomUUID } from 'crypto';

async function main() {
  console.log('Creating public resource locator for GIESM event...\n');

  const eventId = 'cmu2i5e9p0004plkkrnjhej0o';
  const organizationId = 'cmt4odhgn0000wokk8fbwr6ro'; // Neon Ultra Basketball League

  // Verify event exists
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, organizationId: true }
  });

  if (!event) {
    console.error('Event not found!');
    return;
  }

  console.log(`Event: ${event.name}`);
  console.log(`Event ID: ${event.id}`);

  // Check if locator already exists
  const existingLocator = await prisma.publicResourceLocator.findFirst({
    where: {
      resourceId: eventId,
      resourceType: 'EVENT'
    }
  });

  if (existingLocator) {
    console.log('\n✓ Public locator already exists:');
    console.log(`  Public Key: ${existingLocator.publicKey}`);
    console.log(`  URL: https://app.neonultra.ng/public/events/${existingLocator.publicKey}`);
    return;
  }

  // Generate a short, readable public key
  const publicKey = `giesm-2026-${randomUUID().split('-')[0]}`;

  // Create the public resource locator
  const locator = await prisma.publicResourceLocator.create({
    data: {
      organizationId: event.organizationId,
      resourceType: 'EVENT',
      resourceId: eventId,
      publicKey: publicKey,
      status: 'ACTIVE'
    }
  });

  console.log('\n✓ Public locator created successfully!');
  console.log(`  Public Key: ${locator.publicKey}`);
  console.log(`  Status: ${locator.status}`);
  console.log(`\nPublic URL: https://app.neonultra.ng/public/events/${locator.publicKey}`);
  console.log(`\nThe event is now accessible from the public events page.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
