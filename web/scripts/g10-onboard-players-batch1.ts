import { createAdminOfflineIntake } from "../src/lib/admin-offline-intake";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";

const players: Array<{ fullName: string; phone: string; email?: string; gender: "MALE" | "FEMALE" }> = [
  { fullName: "Elijah Nwodo", phone: "08136519180", email: "abuchinwodo04@gmail.com", gender: "MALE" },
  { fullName: "Munachi Okafor", phone: "09038646514", email: "kiritokon000@gmail.com", gender: "MALE" },
  { fullName: "Amir Kabir", phone: "08050373372", email: "amiradeiza079@gmail.com", gender: "MALE" },
  { fullName: "Favour Chinemerem Ejelonu", phone: "08179882102", email: "favourejelonu1999@gmail.com", gender: "MALE" },

  { fullName: "Ada Gift Okechukwu", phone: "07075215281", email: "contactokechukwugift@gmail.com", gender: "FEMALE" },
  { fullName: "Precious Favour Johnson", phone: "08051112823", email: "preciouseleojo@gmail.com", gender: "FEMALE" },
  { fullName: "Imole Olorunfemi", phone: "09169480903", email: "io8500377@gmail.com", gender: "FEMALE" },
  { fullName: "Okoro Nmesomachukwu Naomi", phone: "07063319495", email: "Mygodreigns14@gmail.com", gender: "FEMALE" },
  { fullName: "Godwin Nneoma", phone: "07075011479", email: "nneomagodwin24@gmail.com", gender: "FEMALE" },
  { fullName: "Ginnika Ezeogu", phone: "08053066406", email: "ginikaezeogu1@gmail.com", gender: "FEMALE" },
  { fullName: "Abigail Effiong Akpan", phone: "07053889730", email: "abigailakpan99@gmail.com", gender: "FEMALE" },
  { fullName: "Roli Omatseye", phone: "09160454916", email: "omatseyeroli3@gmail.com", gender: "FEMALE" },
  { fullName: "Favour Franklin", phone: "09032796882", email: "favourfranklin200@gmail.com", gender: "FEMALE" },
  { fullName: "Kemepade precious", phone: "+2349061947760", gender: "FEMALE" },
  { fullName: "Eric Divine", phone: "+2349079306738", gender: "FEMALE" },
  { fullName: "Omolola adeseke Rachael", phone: "+2348118147699", gender: "FEMALE" },
  { fullName: "Emmanuel Amarachi", phone: "+2348163779117", gender: "FEMALE" },
];

async function main() {
  const results: Array<{ name: string; outcome: string; id?: string }> = [];

  for (const p of players) {
    const result = await createAdminOfflineIntake({
      createdById: ACTOR_ID,
      email: p.email,
      fullName: p.fullName,
      participantType: "PLAYER",
      phone: p.phone,
      playerProfile: { gender: p.gender },
      reason: "Offline-recruited player to help complete an 8-man squad.",
    });

    if (!result.created) {
      results.push({
        name: p.fullName,
        outcome: `SKIPPED (already exists): ${result.matches.map((m) => `${m.source} ${m.id} (${m.matchedOn})`).join("; ")}`,
      });
    } else {
      results.push({ id: result.intake.id, name: p.fullName, outcome: "CREATED" });
    }
  }

  for (const r of results) {
    console.log(`${r.outcome.startsWith("CREATED") ? "OK" : "!!"} ${r.name} -> ${r.outcome}${r.id ? ` [${r.id}]` : ""}`);
  }

  const created = results.filter((r) => r.outcome === "CREATED").length;
  const skipped = results.length - created;
  console.log(`\nTotal: ${results.length}, created: ${created}, skipped as duplicates: ${skipped}`);
}

main().finally(() => prisma.$disconnect());
