// D1 responsive table primitive (handoff components.md §Table).
// Dense ops tables scroll inside a min-width track (never shrink columns); fan-facing
// summary tables drop to a stacked two-line layout on mobile. Server-safe, no JS.
export type TableColumn<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  className?: string;
  render?: (row: T, index: number) => React.ReactNode;
};

type DataTableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  minWidth?: string;
  stackOnMobile?: boolean;
  empty?: string;
  highlight?: (row: T) => boolean;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  minWidth = "760px",
  stackOnMobile = false,
  empty = "Nothing here yet.",
  highlight,
}: DataTableProps<T>) {
  const head = (
    <tr className="border-b border-line bg-[#0b0e12] text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">
      {columns.map((col) => (
        <th key={col.key} className={`p-3 ${col.align === "right" ? "text-right" : "text-left"}`}>
          {col.label}
        </th>
      ))}
    </tr>
  );
  const cell = (row: T, col: TableColumn<T>, index: number): React.ReactNode =>
    col.render ? col.render(row, index) : String((row as Record<string, unknown>)[col.key] ?? "");

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-text-3">{empty}</p>;
  }

  if (stackOnMobile) {
    return (
      <>
        {/* Mobile: stacked two-line cards */}
        <div className="space-y-3 md:hidden">
          {rows.map((row, index) => (
            <div
              key={rowKey(row)}
              className={`rounded-lg border border-line bg-ink-800 p-4 ${highlight?.(row) ? "border-brand-400/40 bg-brand-400/[.04]" : ""}`}
            >
              <div className="text-sm font-semibold">{cell(row, columns[0], index)}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-text-2">
                {columns.slice(1).map((col) => (
                  <span key={col.key}>
                    <span className="text-text-3">{col.label} </span>
                    {cell(row, col, index)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Tablet+: real table */}
        <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
          <table className="w-full border-collapse text-sm" style={{ minWidth }}>
            <thead>{head}</thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={rowKey(row)} className={`border-b border-line-subtle ${highlight?.(row) ? "bg-brand-400/[.04]" : "bg-ink-800"}`}>
                  {columns.map((col) => (
                    <td key={col.key} className={`p-3 ${col.align === "right" ? "text-right tabular-nums" : "text-left"} ${col.className ?? ""}`}>
                      {cell(row, col, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>{head}</thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row)} className={`border-b border-line-subtle last:border-0 ${highlight?.(row) ? "bg-brand-400/[.04]" : "bg-ink-800"}`}>
              {columns.map((col) => (
                <td key={col.key} className={`p-3 ${col.align === "right" ? "text-right tabular-nums" : "text-left"} ${col.className ?? ""}`}>
                  {cell(row, col, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}