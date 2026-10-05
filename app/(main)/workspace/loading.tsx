export default function WorkspaceLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#0a0a0a]">
      {/* Chat panel skeleton */}
      <div className="flex w-full flex-col border-r border-white/6 md:w-80 lg:w-96 p-4">
        <div className="mb-4 flex items-center justify-between border-b border-white/6 pb-3">
          <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
          <div className="h-6 w-16 animate-pulse rounded-full bg-white/5" />
        </div>
        <div className="flex-1 space-y-4">
          <div className="h-20 animate-pulse rounded-xl bg-white/5" />
          <div className="h-16 animate-pulse rounded-xl bg-white/5" />
        </div>
        <div className="mt-auto h-24 animate-pulse rounded-xl bg-white/5" />
      </div>

      {/* Code/Preview panel skeleton */}
      <div className="hidden flex-1 flex-col md:flex">
        <div className="flex h-12 items-center justify-between border-b border-white/6 px-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-20 animate-pulse rounded bg-white/10" />
            <div className="h-7 w-20 animate-pulse rounded bg-white/5" />
          </div>
          <div className="h-7 w-24 animate-pulse rounded bg-white/5" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-500" />
            <p className="text-xs text-white/30">Setting up sandbox…</p>
          </div>
        </div>
      </div>
    </div>
  );
}
