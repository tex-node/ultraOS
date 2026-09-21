import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { describeSport, getSportDefinition } from "@/lib/sports/registry";
import { loadActiveSportOverride } from "@/lib/sports/sport-override-store";
import { withOrganizationContext } from "@/lib/tenant-context";
import { SportRulesForm } from "./sport-rules-form";

type OverrideConfig = { rules?: Record<string, number | string | boolean>; defaultDivisions?: string[] };

export default async function SportRulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermissionOrRedirect("competition:manage", `/competitions/${id}/sport-rules`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const result = await withOrganizationContext(organizationId, async (tx) => {
    const competition = await tx.competition.findUnique({ where: { id }, include: { sport: true } });
    if (!competition) return null;
    const override = await loadActiveSportOverride(tx, organizationId, competition.sportId);
    return { competition, override };
  });

  if (!result) notFound();
  const { competition, override } = result;
  const definition = getSportDefinition(competition.sport.slug);

  if (!definition) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-10">
          <Link href={`/competitions/${id}`} className="text-sm text-brand-400">
            ← {competition.name}
          </Link>
          <h1 className="mt-4 text-2xl font-semibold">Sport rules</h1>
          <p className="mt-2 text-sm text-warn">
            No registered definition exists for sport “{competition.sport.name}”, so rules cannot be customized yet.
          </p>
        </main>
      </OperationsShell>
    );
  }

  const config = (override?.config as OverrideConfig | null | undefined) ?? {};
  const overrideRules = config.rules ?? {};
  const rules = (definition.rules ?? []).map((rule) => ({
    key: rule.key,
    label: rule.label ?? rule.key,
    value: Object.prototype.hasOwnProperty.call(overrideRules, rule.key) ? overrideRules[rule.key] : rule.value,
    valueType: typeof rule.value as "number" | "string" | "boolean",
  }));
  const defaultDivisions = (config.defaultDivisions ?? definition.defaultDivisions ?? []).join(", ");

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href={`/competitions/${id}`} className="text-sm text-brand-400">
          ← {competition.name}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Sport rules · {definition.name}</h1>
        <p className="mt-1 text-sm text-text-2">
          Customize rule values for every {definition.name} competition in your organization. Defaults come from the built-in{" "}
          {definition.name} definition.
        </p>
        <p className="mt-2 text-sm text-text-1">{describeSport(definition).formatSummary}</p>
        <SportRulesForm
          competitionId={id}
          sportId={competition.sportId}
          sportName={definition.name}
          rules={rules}
          defaultDivisions={defaultDivisions}
          hasOverride={Boolean(override?.isActive)}
        />
      </main>
    </OperationsShell>
  );
}
