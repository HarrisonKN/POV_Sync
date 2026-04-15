/**
 * SkeletonPulse — a single shimmer block shaped by className / style.
 *
 * Usage:
 *   <SkeletonPulse className="h-4 w-32 rounded" />
 *   <SkeletonPulse className="w-full rounded-xl" style={{ aspectRatio: '16/9' }} />
 */
export default function SkeletonPulse({ className = '', style }) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer rounded ${className}`}
      style={style}
    />
  );
}
