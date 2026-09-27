export default function OfflineFallbackPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-lg font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-text-2">
        This page isn&apos;t cached yet. Scoring and event capture keep working offline — your
        entries are saved locally and sync when you reconnect.
      </p>
    </main>
  );
}
