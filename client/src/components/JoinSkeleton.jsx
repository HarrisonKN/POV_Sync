/**
 * JoinSkeleton
 *
 * Placeholder for /join/:code while the session metadata is being fetched.
 * Mirrors the two-column join layout.
 */
import SkeletonPulse from './SkeletonPulse';

export default function JoinSkeleton() {
  return (
    <div
      aria-label="Loading session info…"
      className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12"
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] items-start">
        {/* Left: session details card */}
        <div className="bg-pov-surface border border-pov-border rounded-2xl p-5 sm:p-6">
          {/* Session header chip + title */}
          <SkeletonPulse className="h-3 w-20 mb-3" />
          <SkeletonPulse className="h-7 w-64 mb-2" />
          <SkeletonPulse className="h-4 w-full max-w-sm mb-6" />

          {/* Already joined list */}
          <SkeletonPulse className="h-3 w-28 mb-2" />
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-pov-border px-3 py-2">
                <SkeletonPulse className="h-5 w-5 rounded-full flex-shrink-0" />
                <SkeletonPulse className="h-4 flex-1" />
              </div>
            ))}
          </div>

          {/* Form fields */}
          <div className="space-y-3 mt-6">
            <SkeletonPulse className="h-10 w-full rounded-lg" />
            <SkeletonPulse className="h-10 w-full rounded-lg" />
            <SkeletonPulse className="h-10 w-full rounded-xl" />
          </div>
        </div>

        {/* Right: info card */}
        <div className="bg-pov-surface border border-pov-border rounded-2xl p-5 sm:p-6">
          <SkeletonPulse className="h-3 w-24 mb-3" />
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonPulse key={i} className="h-4 w-full max-w-xs" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
