import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('Checking public events listing...\n');

  // Get all active event locators
  const locators = await prisma.publicResourceLocator.findMany({
    where: {
      resourceType: 'EVENT',
      status: 'ACTIVE'
    },
    select: {
      publicKey: true,
      resourceId: true,
      createdAt: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 10
  });

  console.log(`Found ${locators.length} active event locators:\n`);

  for (const locator of locators) {
    const event = await prisma.event.findUnique({
      where: { id: locator.resourceId },
      select: {
        name: true,
        status: true,
        date: true,
        startTime: true
      }
    });

    if (event) {
      console.log(`✓ ${event.name}`);
      console.log(`  Public Key: ${locator.publicKey}`);
      console.log(`  Event Status: ${event.status}`);
      console.log(`  Date: ${event.date.toISOString().split('T')[0]}`);
      console.log(`  URL: https://app.neonultra.ng/public/events/${locator.publicKey}`);
      console.log();
    }
  }

  // Check if GIESM event appears
  const giesmLocator = locators.find(l => l.resourceId === 'cmu2i5e9p0004plkkrnjhej0o');
  if (giesmLocator) {
    console.log('✓ GIESM event is in the public events listing');
  } else {
    console.log('✗ GIESM event is NOT in the recent 10 events (may be older)');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
