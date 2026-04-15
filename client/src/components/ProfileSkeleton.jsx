/**
 * ProfileSkeleton
 *
 * Placeholder for /profile and /profile/:userId while data loads.
 * Mirrors the profile header, stat row, network cards, and session grid.
 */
import SkeletonPulse from './SkeletonPulse';

export default function ProfileSkeleton() {
  return (
    <div
      aria-label="Loading profile…"
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-in"
    >
      {/* ── Profile header ───────────────────────────────── */}
      <div className="bg-pov-surface border border-pov-border rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
        <div className="flex items-center gap-4 sm:gap-5">
          {/* Avatar */}
          <SkeletonPulse className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <SkeletonPulse className="h-6 w-40 mb-2" />
            <SkeletonPulse className="h-4 w-56" />
          </div>
          {/* Stat pills — desktop */}
          <div className="hidden sm:flex flex-wrap items-center justify-end gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-full border border-pov-border/60 bg-pov-bg/60 px-3 py-1.5">
                <SkeletonPulse className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
        {/* Stat cards — mobile */}
        <div className="grid grid-cols-2 gap-2 mt-4 sm:hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-pov-border/60 bg-pov-bg/60 px-3 py-2.5">
              <SkeletonPulse className="h-3 w-16 mb-1.5" />
              <SkeletonPulse className="h-5 w-10" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Network cards ────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {[0, 1].map((col) => (
          <div key={col} className="bg-pov-surface border border-pov-border rounded-xl p-4">
            <SkeletonPulse className="h-4 w-20 mb-3" />
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonPulse key={i} className="h-8 w-8 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab bar ──────────────────────────────────────── */}
      <div className="flex gap-4 border-b border-pov-border mb-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonPulse key={i} className="h-4 w-14 mb-3" />
        ))}
      </div>

      {/* ── Session grid ─────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border border-pov-border bg-pov-surface p-4">
            <SkeletonPulse className="h-4 w-32 mb-2" />
            <SkeletonPulse className="h-3 w-24 mb-3" />
            <div className="flex items-center justify-between">
              <SkeletonPulse className="h-5 w-16 rounded-full" />
              <SkeletonPulse className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
