/**
 * HomeSkeleton
 *
 * Placeholder for the signed-in dashboard in Home.jsx while session/feed
 * data is loading. Mirrors the greeting, action cards, and session grids.
 */
import SkeletonPulse from './SkeletonPulse';

export default function HomeSkeleton() {
  return (
    <div
      aria-label="Loading dashboard…"
      className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-in"
    >
      {/* ── Greeting row ──────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <SkeletonPulse className="h-7 w-40 mb-1.5" />
          <SkeletonPulse className="h-4 w-28" />
        </div>
        <SkeletonPulse className="h-7 w-20 rounded-full" />
      </div>

      {/* ── Action cards row ──────────────────────────── */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 mb-6 sm:mb-8">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-pov-border bg-pov-surface p-5 flex items-center gap-4">
            <SkeletonPulse className="w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="flex-1">
              <SkeletonPulse className="h-4 w-28 mb-1.5" />
              <SkeletonPulse className="h-3 w-44" />
            </div>
          </div>
        ))}
      </div>

      {/* ── Discover / Following strip ────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6 sm:mb-8">
        {[0, 1].map((col) => (
          <div key={col} className="bg-pov-surface border border-pov-border rounded-xl p-4 sm:p-5">
            <SkeletonPulse className="h-3 w-24 mb-2" />
            <SkeletonPulse className="h-4 w-full max-w-xs mb-4" />
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-pov-border/60 px-3 py-2.5">
                  <SkeletonPulse className="h-8 w-8 rounded-lg flex-shrink-0" />
                  <div className="flex-1">
                    <SkeletonPulse className="h-3 w-28 mb-1" />
                    <SkeletonPulse className="h-2.5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Live sessions section ─────────────────────── */}
      <div className="mb-6">
        <SkeletonPulse className="h-3 w-24 mb-3" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-pov-border bg-pov-surface p-4">
              <SkeletonPulse className="h-5 w-16 rounded-full mb-2" />
              <SkeletonPulse className="h-4 w-36 mb-1.5" />
              <SkeletonPulse className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent sessions section ───────────────────── */}
      <div>
        <SkeletonPulse className="h-3 w-28 mb-3" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-pov-border bg-pov-surface p-4">
              <SkeletonPulse className="h-4 w-32 mb-2" />
              <SkeletonPulse className="h-3 w-24 mb-3" />
              <div className="flex items-center justify-between">
                <SkeletonPulse className="h-5 w-14 rounded-full" />
                <SkeletonPulse className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
