/**
 * SessionSkeleton
 *
 * Placeholder for /session/:id (Viewer) and /watch/:code (Spectator).
 * Mirrors the actual layout: room header → stage → filmstrip → controls.
 */
import SkeletonPulse from './SkeletonPulse';

export default function SessionSkeleton() {
  return (
    <div
      aria-label="Loading session…"
      className="w-full max-w-none px-2.5 sm:px-4 py-3 sm:py-4 animate-in"
    >
      {/* ── Room header ─────────────────────────────────────── */}
      <div className="mb-3 sm:mb-4 rounded-2xl border border-pov-border/60 bg-pov-surface/60 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex items-center gap-2 mb-3">
          <SkeletonPulse className="h-5 w-20 rounded-full" />
          <SkeletonPulse className="h-5 w-24 rounded-full" />
          <SkeletonPulse className="h-4 w-14 rounded-full" />
        </div>
        <SkeletonPulse className="h-6 w-56 mb-2" />
        <SkeletonPulse className="h-4 w-80 max-w-full" />
        <div className="hidden sm:grid sm:grid-cols-3 gap-2 mt-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-pov-border/60 bg-pov-bg/60 px-3 py-2">
              <SkeletonPulse className="h-2.5 w-12 mb-1.5" />
              <SkeletonPulse className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Main stage ──────────────────────────────────────── */}
      <div className="mb-3 sm:mb-4 flex justify-center">
        <div
          className="w-full rounded-2xl overflow-hidden"
          style={{ aspectRatio: '16/9', maxWidth: 'min(100%, calc((100vh - 360px) * 16 / 9))' }}
        >
          <SkeletonPulse className="w-full h-full rounded-2xl" />
        </div>
      </div>

      {/* ── Filmstrip ───────────────────────────────────────── */}
      <div className="flex gap-2 sm:gap-3 overflow-hidden mb-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex-shrink-0 rounded-xl overflow-hidden border border-pov-border/40"
            style={{ width: 200 }}
          >
            <div style={{ aspectRatio: '16/9' }}>
              <SkeletonPulse className="w-full h-full rounded-none" />
            </div>
            <div className="px-2 py-1.5 flex items-center justify-between gap-2">
              <SkeletonPulse className="h-3 w-20" />
              <SkeletonPulse className="h-3 w-8 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* ── Controls bar ────────────────────────────────────── */}
      <div className="rounded-lg border border-pov-border/60 bg-pov-surface/60 p-3 sm:p-4 mt-2 sm:mt-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <SkeletonPulse className="h-3 w-28" />
          <SkeletonPulse className="h-6 w-40 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonPulse key={i} className="h-9 sm:w-16" />
          ))}
        </div>
      </div>
    </div>
  );
}
