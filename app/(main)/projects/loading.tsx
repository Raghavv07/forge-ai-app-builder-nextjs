export default function ProjectsLoading() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-10">
      <div className="mx-auto max-w-5xl">
        {/* Header skeleton */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="h-14 w-48 animate-pulse rounded-lg bg-white/5" />
            <div className="mt-3 h-4 w-64 animate-pulse rounded bg-white/5" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-32 animate-pulse rounded-lg bg-white/5" />
            <div className="h-9 w-28 animate-pulse rounded-lg bg-white/10" />
          </div>
        </div>

        {/* Project cards skeleton grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex h-36 flex-col justify-between rounded-xl border border-white/6 bg-[#0f0f0f] p-4"
            >
              <div>
                <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
                <div className="mt-3 h-3 w-5/6 animate-pulse rounded bg-white/5" />
                <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-white/5" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/4">
                <div className="h-3 w-16 animate-pulse rounded bg-white/5" />
                <div className="h-3 w-12 animate-pulse rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
