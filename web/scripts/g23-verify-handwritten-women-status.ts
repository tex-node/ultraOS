import { prisma } from "../src/lib/prisma";

const people: Array<{ club: string; name: string; phone: string; email: string }> = [
  { club: "Eclipse", email: "oreoluwabakare23@gmail.com", name: "Bakare Oreoluwa Olohitare", phone: "08154529099" },
  { club: "Eclipse", email: "mosesbiola17@gmail.com", name: "Biola Moses", phone: "08059858423" },
  { club: "Eclipse", email: "maryveronica56e@gmail.com", name: "Mary Veronica", phone: "07047335383" },
  { club: "Eclipse", email: "tinaberry08@gmail.com", name: "Udoyibo Goodluck", phone: "08140289567" },
  { club: "Eclipse", email: "agomuofaith54@gmail.com", name: "Agomuo Faith", phone: "08063091540" },

  { club: "Ember", email: "eakingbade23@gmail.com", name: "Akingbade Elizabeth", phone: "07057168659" },
  { club: "Ember", email: "gracieemmanuel8@gmail.com", name: "Precious Aden", phone: "09060558751" },
  { club: "Ember", email: "bennychi12345@gmail.com", name: "Mbah Chinyere", phone: "07040770570" },
  { club: "Ember", email: "aminatadeola35@gmail.com", name: "Aminat Shoboye", phone: "07069774338" },
  { club: "Ember", email: "ekunmyne5@gmail.com", name: "Ekun God'sGrace", phone: "07048105766" },

  { club: "Nova", email: "rayjohn4199@gmail.com", name: "Rachel John", phone: "08163889906" },
  { club: "Nova", email: "eibukunoluwa894@gmail.com", name: "Oyekan Aishat", phone: "07062477873" },
  { club: "Nova", email: "daniellachidinma928@gmail.com", name: "Okafor Chidinma Daniella", phone: "07036181319" },
  { club: "Nova", email: "offiongsharon88@gmail.com", name: "Offiong Sharon", phone: "09161160119" },
  { club: "Nova", email: "ifunayasylvia831@gmail.com", name: "Okechukwu Sylvia Chilezie", phone: "08100245156" },
];

async function main() {
  for (const p of people) {
    const application = await prisma.application.findFirst({
      where: { submittedData: { path: ["email"], equals: p.email } },
      select: { id: true, status: true, createdAt: true },
    });
    const athlete = await prisma.athlete.findFirst({
      where: { OR: [{ email: p.email }, { phone: p.phone }] },
      select: { id: true, firstName: true, lastName: true },
    });
    const player = athlete
      ? await prisma.player.findFirst({
          where: { athleteId: athlete.id },
          select: { id: true, status: true, draftSelectionGroup: true, seasonClubId: true },
        })
      : null;
    console.log(
      `[${p.club}] ${p.name} <${p.email}> ->`,
      `Application: ${application ? `${application.id} (${application.status})` : "NOT FOUND"} |`,
      `Athlete: ${athlete ? `${athlete.id} (${athlete.firstName} ${athlete.lastName})` : "NOT FOUND"} |`,
      `Player: ${player ? `${player.id} status=${player.status} group=${player.draftSelectionGroup} club=${player.seasonClubId ?? "none"}` : "NOT FOUND"}`,
    );
  }
}

main().finally(() => prisma.$disconnect());
