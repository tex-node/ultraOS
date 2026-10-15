"use client";

// No PDF library: the browser's print dialog plus the print stylesheet in the coaching layout.
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-[36px] rounded-md border border-line-strong px-3 text-xs text-text-1 transition hover:border-brand-400/40 hover:text-white print:hidden"
    >
      {label}
    </button>
  );
}
