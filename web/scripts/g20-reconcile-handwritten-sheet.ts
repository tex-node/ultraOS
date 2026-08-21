import ExcelJS from "exceljs";

const FILE = "C:/UltraLeagueOS/data/TryOutsPlayers.xlsx";

function normPhone(v: unknown): string {
  return String(v ?? "").replace(/[^\d]/g, "").replace(/^0/, "");
}

const handwritten: Array<{ club: string; name: string; phone: string }> = [
  { club: "Eclipse", name: "Bakare Oreoluwa Olohitare", phone: "08154529099" },
  { club: "Eclipse", name: "Bida/Biola Moses", phone: "08059858423" },
  { club: "Eclipse", name: "Mary Veronica", phone: "07047335383" },
  { club: "Eclipse", name: "Udoyibo Goodluck", phone: "08140287567" },
  { club: "Eclipse", name: "Agomuo Faith", phone: "08063691540" },

  { club: "Ember", name: "Afaingbe/Akingbade Elizabeth", phone: "07057168659" },
  { club: "Ember", name: "Precious Aden", phone: "09060558751" },
  { club: "Ember", name: "Mbah Chinyere", phone: "07040770570" },
  { club: "Ember", name: "Amnad Shobaye", phone: "07069774338" },
  { club: "Ember", name: "Ekun Grace grace", phone: "07048105766" },

  { club: "Nova", name: "Rachel John", phone: "08163889906" },
  { club: "Nova", name: "Ogekan/Oyekan Aishat", phone: "08139296793" },
  { club: "Nova", name: "Okoro Chidinma", phone: "07036181319" },
  { club: "Nova", name: "Offiong Sharon", phone: "09161160119" },
  { club: "Nova", name: "Okechukwu Sylvia Chilese", phone: "09079084184" },

  { club: "Halo", name: "Samuel Olutosoye (crossed out)", phone: "07070632052" },
  { club: "Halo", name: "Hawau Ayomide", phone: "08022370033" },
  { club: "Halo", name: "Grace Olutosoye", phone: "08135889298" },
];

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE);
  const sheet = workbook.getWorksheet("Female")!;
  const header = (sheet.getRow(1).values as unknown[]).map((v) => String(v ?? ""));
  const phoneCol = header.indexOf("Phone");
  const nameCol = header.indexOf("Full Name");
  const emailCol = header.indexOf("Email");
  const statusCol = header.indexOf("Status");

  const byPhone = new Map<string, { name: string; email: string; status: unknown }[]>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    const phone = normPhone(values[phoneCol]);
    if (!phone) return;
    const entry = { email: String(values[emailCol] ?? ""), name: String(values[nameCol] ?? ""), status: values[statusCol] };
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone)!.push(entry);
  });

  console.log("Reconciliation against TryOutsPlayers.xlsx (Female sheet):\n");
  for (const h of handwritten) {
    const key = normPhone(h.phone);
    const matches = byPhone.get(key);
    if (!matches) {
      console.log(`[${h.club}] "${h.name}" (${h.phone}) -> NO MATCH in spreadsheet by phone`);
    } else {
      for (const m of matches) {
        console.log(`[${h.club}] "${h.name}" (${h.phone}) -> "${m.name}" <${m.email}> status=${m.status}`);
      }
    }
  }
}

main();
