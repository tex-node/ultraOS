import Link from "next/link";
import { buildResultsBoard, type EventResults, type ResultCategoryView, type ResultPlacementView } from "@/lib/public/event-results";

// One rendering of published results, shared by the public event page, the tournament sub-site and the
// event short link (v33). Before this, each surface had its own copy of the same list and only one of
// them showed the extra facts; the flag race is where that mattered, because a race needs its bibs and
// its times to be worth reading.
const MEDAL_STYLE: Record<NonNullable<ResultPlacementView["medal"]>, { ring: string; badge: string; label: string }> = {
  gold: { ring: "border-warn/40", badge: "bg-warn/15 text-warn", label: "Gold" },
  silver: { ring: "border-line", badge: "bg-white/10 text-text-1", label: "Silver" },
  bronze: { ring: "border-line", badge: "bg-white/[.07] text-text-2", label: "Bronze" },
};

const GENDER_HEADING: Record<ResultCategoryView["gender"], string> = {
  MALE: "Men",
  FEMALE: "Women",
  MIXED: "Open",
};

function PlacementRow({ placement }: { placement: ResultPlacementView }) {
  const style = placement.medal ? MEDAL_STYLE[placement.medal] : null;
  return (
    <li className={`flex items-start gap-3 rounded-md border px-3 py-2 ${style ? style.ring : "border-transparent"}`}>
      <span
        aria-label={style ? `${style.label} medal, position ${placement.rank}` : `Position ${placement.rank}`}
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${style ? style.badge : "bg-white/10 text-text-2"}`}
      >
        {placement.rank}
      </span>
      <div className="min-w-0">
        <p className="text-text-1">
          {placement.name}
          {placement.bib ? <span className="ml-2 font-mono text-xs text-text-3">#{placement.bib}</span> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-3">
          {placement.detail ? <span>{placement.detail}</span> : null}
          {placement.time ? <span className="font-mono text-info">{placement.time}</span> : null}
          {placement.note ? <span className="text-warn">{placement.note}</span> : null}
        </p>
      </div>
    </li>
  );
}

function CategoryCard({ category, showGender }: { category: ResultCategoryView; showGender: boolean }) {
  return (
    <article className="rounded-lg border border-line bg-ink-800 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold text-text-1">
          {showGender ? `${GENDER_HEADING[category.gender]} · ` : null}
          {category.label}
        </h4>
        <span className="text-xs uppercase tracking-[.18em] text-text-3">{category.placements.length} placed</span>
      </header>
      {category.note ? <p className="mt-1 text-xs text-warn">{category.note}</p> : null}
      {category.placements.length === 0 ? (
        <p className="mt-3 text-sm text-text-3">No placements published for this category yet.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {category.placements.map((placement) => (
            <PlacementRow key={`${category.key}-${placement.rank}-${placement.name}`} placement={placement} />
          ))}
        </ol>
      )}
    </article>
  );
}

export function EventResultsBoard({
  results,
  title = "Final results",
  showGenderHeadings = true,
  className,
}: {
  results: EventResults;
  title?: string;
  /** Off when the category labels already name the gender ("Male flag race"), on when they do not. */
  showGenderHeadings?: boolean;
  className?: string;
}) {
  const board = buildResultsBoard(results);
  if (!board.hasResults) return null;

  return (
    <section className={className ?? "mt-10"} aria-labelledby="final-results-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="final-results-heading" className="text-2xl font-semibold">
          {title}
        </h2>
        {board.publishedAt ? (
          <p className="text-xs text-text-3">Published {new Date(board.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        ) : null}
      </div>

      {board.team.length ? (
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-[.24em] text-brand-400">Team standings</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {board.team.map((category) => (
              <CategoryCard key={category.key} category={category} showGender={showGenderHeadings && category.gender !== "MIXED"} />
            ))}
          </div>
        </div>
      ) : null}

      {board.individual.length ? (
        <div className={board.team.length ? "mt-8" : "mt-6"}>
          <h3 className="text-xs uppercase tracking-[.24em] text-brand-400">Individual events</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {board.individual.map((category) => (
              <CategoryCard key={category.key} category={category} showGender={showGenderHeadings && category.gender !== "MIXED"} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ResultsLink({ href, label = "See the full tournament" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="text-sm text-brand-300 underline-offset-4 hover:underline">
      {label}
    </Link>
  );
}
