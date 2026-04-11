import { Link } from 'react-router-dom';

export default function SessionResumeCard({
  session,
  to,
  title = 'Return to your live session',
  subtitle = 'Jump back in with one click.',
  ctaLabel = 'Return to Session',
  compact = false,
  className = '',
}) {
  if (!session) return null;

  const streams = session.streams || [];
  const participants = streams.slice(0, 3).map((stream) => stream.display_name).filter(Boolean);
  const extra = Math.max(0, streams.length - participants.length);
  const liveCountLabel = streams.length > 0 ? `${streams.length} POV${streams.length !== 1 ? 's' : ''}` : 'Live session';
  const href = to || `/session/${session.id}`;

  return (
    <div className={`bg-pov-surface border border-pov-success/20 rounded-xl ${compact ? 'p-4' : 'p-5'} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-pov-success bg-pov-success/10 border border-pov-success/20 rounded-full px-2.5 py-1 mb-3">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-pov-success" />
            Live now
          </div>
          <h3 className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-pov-text truncate`}>
            {title}
          </h3>
          <p className="text-xs text-pov-muted mt-1 leading-relaxed">{subtitle}</p>
        </div>
        <Link
          to={href}
          className="flex-shrink-0 text-xs font-semibold bg-pov-success text-white rounded-lg px-3 py-2 hover:bg-pov-success/90 transition-colors"
        >
          {ctaLabel}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-pov-muted">
        <span className="font-mono text-pov-success/90">{liveCountLabel}</span>
        <span className="text-pov-border">•</span>
        <span className="truncate max-w-full">
          {participants.length > 0 ? participants.join(', ') : 'Session is active'}
          {extra > 0 ? ` +${extra}` : ''}
        </span>
      </div>
    </div>
  );
}