import Link from "next/link";

import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { VisionUploadForm } from "./upload-form";
import { LocalVisionPanel } from "./local-vision-panel";
import { CloudHarness } from "./cloud-harness";

export const dynamic = "force-dynamic";

// /vision/upload (streak v8, Prompt 2): self-serve video ingestion.
//
// Until now the only way in was `scripts/vision-ingest.ts`, which needs SSH and a file path on the host. An
// operator with a phone recording could not get footage into the system, so the review queue and the analysis
// pipeline had nothing to work on.
export default async function VisionUploadPage() {
  // Redirect rather than 404: a signed-in user without vision:manage should be told they lack access, not that the page is missing.
  const session = await requirePermissionOrRedirect("vision:manage", "/vision/upload");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const fixtures = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.fixture.findMany({
      where: { OR: [{ homeSeasonClubId: { not: null } }, { homeEntrantId: { not: null } }] },
      orderBy: { scheduledAt: "desc" },
      take: 50,
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        homeSeasonClub: { select: { club: { select: { name: true } } } },
        awaySeasonClub: { select: { club: { select: { name: true } } } },
        homeEntrant: { select: { name: true } },
        awayEntrant: { select: { name: true } },
        _count: { select: { gameVideos: true } },
      },
    }),
  );

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Desktop-only: renders nothing in a browser, where the server-side flow below is the only path. */}
        <LocalVisionPanel
          fixtures={fixtures.map((fixture) => ({
            id: fixture.id,
            label: `${fixture.homeSeasonClub?.club.name ?? fixture.homeEntrant?.name ?? "?"} v ${fixture.awaySeasonClub?.club.name ?? fixture.awayEntrant?.name ?? "?"} · ${fixture.status} · ${fixture.scheduledAt.toISOString().slice(0, 10)}`,
          }))}
        />
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">Upload game video</h1>
          <Link href="/vision/videos" className="text-sm text-info underline">
            All videos
          </Link>
        </div>
        <p className="mt-1 text-sm text-text-2">
          Register footage for analysis. Nothing here claims a result: the file is stored and a GameVideo row is created;
          the vision worker analyses it later and an operator reviews every observation.
        </p>
        <CloudHarness>
          <VisionUploadForm
          fixtures={fixtures.map((fixture) => ({
            id: fixture.id,
            label: `${fixture.homeSeasonClub?.club.name ?? fixture.homeEntrant?.name ?? "?"} v ${fixture.awaySeasonClub?.club.name ?? fixture.awayEntrant?.name ?? "?"} · ${fixture.status} · ${fixture.scheduledAt.toISOString().slice(0, 10)}${fixture._count.gameVideos > 0 ? ` · ${fixture._count.gameVideos} video(s)` : ""}`,
          }))}
        />
        </CloudHarness>
      </main>
    </>
  );
}
