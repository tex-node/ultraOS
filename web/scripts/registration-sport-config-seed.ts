// Idempotent, non-destructive seed for a RegistrationForm's sport configuration.
//
// Dry-run by default. Requires an explicit event (by slug) or form id, and an
// organization slug - nothing is guessed or hardcoded. Never targets production
// automatically; run with an approved DATABASE_URL and pass --apply to write.
//
// Usage:
//   tsx scripts/registration-sport-config-seed.ts --organization-slug <slug> --event-slug <slug> [--create-form] [--preset all-female-vb-flag] [--apply] [--overwrite]
//   tsx scripts/registration-sport-config-seed.ts --form-id <id> [--apply]
import { prisma } from "../src/lib/prisma";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "../src/lib/tenant-context";
import { SPORT_CONFIG_PRESETS, planSportConfigSeed, type SportConfigPresetName, describeRoster } from "../src/lib/registration/sport-config-admin";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = flag("apply");
  const overwrite = flag("overwrite");
  const createForm = flag("create-form");
  const presetName = (arg("preset") ?? "all-female-vb-flag") as SportConfigPresetName;
  const preset = SPORT_CONFIG_PRESETS[presetName];
  if (!preset) throw new Error(`Unknown preset "${presetName}". Known: ${Object.keys(SPORT_CONFIG_PRESETS).join(", ")}`);
  const config = preset.build();

  const organizationSlug = arg("organization-slug");
  const eventSlug = arg("event-slug");
  const formId = arg("form-id");
  if (!formId && !(organizationSlug && eventSlug)) {
    throw new Error("Provide --form-id OR both --organization-slug and --event-slug.");
  }

  const roleCheck = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
  console.log(`role=${JSON.stringify(roleCheck[0])} mode=${apply ? "APPLY" : "DRY-RUN"} preset=${presetName}`);

  let organizationId: string;
  let resolvedFormId: string;
  if (formId) {
    const form = await prisma.registrationForm.findUnique({ where: { id: formId }, select: { id: true, organizationId: true } });
    if (!form) throw new Error(`RegistrationForm ${formId} not found.`);
    organizationId = form.organizationId;
    resolvedFormId = form.id;
  } else {
    const organization = await resolveActiveOrganizationBySlug(organizationSlug!);
    organizationId = organization.id;
    const found = await withOrganizationContext(organizationId, async (tx) => {
      const event = await tx.event.findFirst({ where: { organizationId, slug: eventSlug! }, select: { id: true, name: true } });
      if (!event) throw new Error(`Event "${eventSlug}" not found for organization "${organizationSlug}".`);
      let form = await tx.registrationForm.findFirst({ where: { organizationId, eventId: event.id }, select: { id: true } });
      if (!form) {
        if (!createForm) throw new Error(`No registration form for event "${eventSlug}". Re-run with --create-form.`);
        form = await tx.registrationForm.create({ data: { organizationId, eventId: event.id, title: arg("title") ?? `${event.name} registration`, mode: "TEAM", status: "DRAFT", publicEnabled: false } });
        console.log(`created registration form ${form.id} for event ${eventSlug}`);
      }
      return form;
    });
    resolvedFormId = found.id;
  }

  const result = await withOrganizationContext(organizationId, async (tx) => {
    const form = await tx.registrationForm.findUniqueOrThrow({ where: { id: resolvedFormId } });
    const plan = planSportConfigSeed(form.sportConfig, config, { overwrite });
    console.log(`plan=${plan.action} (${plan.reason})`);
    console.log(`  ${describeRoster("VOLLEYBALL", config.rosters.VOLLEYBALL)}`);
    console.log(`  ${describeRoster("FLAG_RACE", config.rosters.FLAG_RACE)}`);
    if (apply && plan.action !== "SKIP") {
      await tx.registrationForm.update({ where: { id: form.id }, data: { sports: config.sports, sportConfig: config as object } });
      console.log("applied.");
    } else if (apply) {
      console.log("no change applied.");
    }
    return plan.action;
  });
  console.log(`done: ${result} (${apply ? "written" : "dry-run, nothing written"})`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
