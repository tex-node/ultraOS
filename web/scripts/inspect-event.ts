import { prisma } from '../src/lib/prisma';

async function main() {
  const event = await prisma.event.findUnique({
    where: { id: 'cmu2i5e9p0004plkkrnjhej0o' },
    include: { 
      registrationForms: {
        include: {
          fields: true
        }
      },
      venue: true,
      season: true
    }
  });
  
  console.log(JSON.stringify(event, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
