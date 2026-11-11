export const dynamic = "force-dynamic";

// (capture) — the courtside viewport: scorer console, statistician console, check-in.
//
// No sidebar, no header, no footer, no page margins, and no animation. A person is standing at a scorer's table holding a
// tablet, and every pixel that is not the score, the clock or the pad is a pixel they have to look past. Navigation out of here
// is deliberate: the exit control on each page, which asks before it leaves.
//
// The root layout still owns <html>/<body>; this segment owns everything inside it.
export default function CaptureLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-black text-white antialiased">{children}</div>;
}
