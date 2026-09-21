import { PortalShell } from "@/app/components/portal-shell";
import { Button } from "@/app/components/ui/button";
import { Field, SelectInput, TextAreaInput, TextInput } from "@/app/components/ui/field";
import { Badge, Card, EmptyState, LinkTabs, Skeleton, Steps } from "@/app/components/ui/primitives";
import { BracketNode, QrCard, ScorePill } from "@/app/components/ui/fan";

export const dynamic = "force-dynamic";

// D1 component gallery, aligned with UI/NEON_ULTRA_CLAUDE_DESIGN_SYSTEM.md.
// Public but unlinked — reviewers open /design directly.
export default async function DesignGallery() {
  const swatch = (name: string, cls: string) => (
    <div className="flex items-center gap-3">
      <span className={`h-10 w-10 shrink-0 rounded-md border border-line-strong ${cls}`} />
      <code className="text-xs text-text-2">{name}</code>
    </div>
  );
  return (
    <PortalShell>
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-12">
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-brand-400">Design system · D1</p>
          <h1 className="mt-2 font-display text-4xl font-bold">Tokens & components</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-2">
            Single source of truth for the overhaul. Review at 390px, 768px, and 1280px —
            every section below must hold together at all three.
          </p>
        </header>

        <Card>
          <h2 className="font-display text-lg font-semibold">Color tokens</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {swatch("brand-400 #00F076", "bg-brand-400")}
            {swatch("ink-900 #080A0D", "bg-ink-900")}
            {swatch("ink-800 #111318", "bg-ink-800")}
            {swatch("ink-700 #1A1F26", "bg-ink-700")}
            {swatch("success #22C55E", "bg-success")}
            {swatch("warn #F59E0B", "bg-warn")}
            {swatch("danger #EF4444", "bg-danger")}
            {swatch("info #3B82F6", "bg-info")}
            {swatch("purple #A855F7", "bg-accent-purple")}
            {swatch("line #272D37", "bg-line")}
            {swatch("text-1 #F9FAFB", "bg-text-1")}
            {swatch("text-3 #6B7280", "bg-text-3")}
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold">Type scale</h2>
          <div className="mt-4 space-y-2">
            <p className="font-display text-4xl font-bold">Display — Space Grotesk Bold</p>
            <p className="font-display text-2xl font-semibold">Heading — Space Grotesk SemiBold</p>
            <p className="text-sm text-text-2">Body — Inter Regular for functional UI.</p>
            <p className="text-xs uppercase tracking-[0.2em] text-text-3">Eyebrow — system labels only</p>
            <p className="font-mono text-xl font-bold tabular-nums">Metric — tabular numerals 25–23</p>
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold">Buttons</h2>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button size="sm">Small</Button>
            <Button size="courtside">+2 courtside</Button>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="courtside" className="flex-1">
              Full-width courtside
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold">Fields</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Team name" hint="As it appears on scoreboards">
              <TextInput placeholder="e.g. Apex" />
            </Field>
            <Field label="Sport" error="Pick a sport to continue">
              <SelectInput defaultValue="">
                <option value="">Choose…</option>
                <option>Basketball</option>
                <option>Volleyball</option>
              </SelectInput>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <TextAreaInput rows={2} placeholder="Optional context" />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold">Badges & tabs</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="active">● Active</Badge>
            <Badge tone="live">● Live</Badge>
            <Badge tone="upcoming">● Upcoming</Badge>
            <Badge tone="completed">Completed</Badge>
            <Badge tone="draft">Draft</Badge>
            <Badge tone="featured">★ Featured</Badge>
          </div>
          <div className="mt-4">
            <LinkTabs
              basePath="/design"
              pathname="/design"
              tabs={[
                { href: "/design", label: "Overview" },
                { href: "/design/fixtures", label: "Fixtures & Stats" },
              ]}
            />
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold">Pipeline steps</h2>
          <div className="mt-4 space-y-4">
            <Steps steps={["Pending", "Paid", "Preparing", "Ready", "Collected"]} current={2} />
            <Steps steps={["Pending", "Paid", "Preparing", "Ready", "Collected"]} current={1} failed />
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <QrCard code="NEON-ULTRA-DEMO-0001" title="Ultra event ticket" subtitle="Demo Zone · 1 admission" status="ACTIVE" />
          <div className="space-y-4">
            <Card>
              <h2 className="font-display text-lg font-semibold">Score pill</h2>
              <div className="mt-3">
                <ScorePill home="APX" away="VTX" homeScore={2} awayScore={1} />
              </div>
            </Card>
            <Card>
              <h2 className="font-display text-lg font-semibold">Bracket node</h2>
              <div className="mt-3 overflow-x-auto pb-1">
                <BracketNode label="Semifinal 1" home="Apex" away="Vortex" homeScore={2} awayScore={1} />
              </div>
            </Card>
          </div>
        </div>

        <Card>
          <h2 className="font-display text-lg font-semibold">Empty state & skeletons</h2>
          <div className="mt-4">
            <EmptyState
              title="No tournaments yet"
              body="Tournaments you follow will appear here. Browse the discovery hub to find one."
              action={<Button size="sm">Find tournaments</Button>}
            />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold">Breakpoints under review</h2>
          <div className="mt-2 text-sm text-text-2">
            <p>Mobile &lt; 768px · Tablet 768–1279px · Desktop ≥ 1280px.</p>
            <p className="mt-1">Fixed-format exceptions: scoreboard, display clock, broadcast graphics (16:9, projector/OBS).</p>
          </div>
        </Card>
      </main>
    </PortalShell>
  );
}
