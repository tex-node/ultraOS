import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('Checking GIESM event public locator...\n');

  const eventId = 'cmu2i5e9p0004plkkrnjhej0o';

  // Check if event exists
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, status: true }
  });

  if (!event) {
    console.error('Event not found!');
    return;
  }

  console.log('Event found:');
  console.log(`  ID: ${event.id}`);
  console.log(`  Name: ${event.name}`);
  console.log(`  Status: ${event.status}`);

  // Check for public resource locator
  const locator = await prisma.publicResourceLocator.findFirst({
    where: {
      resourceId: eventId,
      resourceType: 'EVENT'
    }
  });

  if (locator) {
    console.log('\n✓ Public locator found:');
    console.log(`  Public Key: ${locator.publicKey}`);
    console.log(`  Status: ${locator.status}`);
    console.log(`\nPublic URL: https://app.neonultra.ng/public/events/${locator.publicKey}`);
    console.log(`\nYou can also access via vanity slug if configured.`);
  } else {
    console.log('\n✗ No public locator found for this event!');
    console.log('\nThe event needs a public resource locator to be accessible via /public/events/[id]');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
