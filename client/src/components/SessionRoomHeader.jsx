export default function SessionRoomHeader({
  title,
  session,
  hostLabel = 'Host',
  roleLabel = 'Room participant',
  roleTone = 'neutral',
  statusLabel = 'Live',
  statusTone = 'live',
  secondaryLabel,
  className = '',
}) {
  if (!session) return null;

  const sessionCode = session.participant_link || session.spectator_link || session.id?.slice(0, 8) || 'session';
  const roleClass =
    roleTone === 'host'
      ? 'text-pov-accent bg-pov-accent/10 border-pov-accent/20'
      : roleTone === 'spectator'
        ? 'text-pov-muted bg-pov-muted/10 border-pov-muted/20'
        : 'text-pov-success bg-pov-success/10 border-pov-success/20';
  const statusClass =
    statusTone === 'ended'
      ? 'text-pov-muted bg-pov-muted/10 border-pov-muted/20'
      : statusTone === 'vod'
        ? 'text-pov-warning bg-pov-warning/10 border-pov-warning/20'
        : 'text-pov-success bg-pov-success/10 border-pov-success/20';

  return (
    <div className={`bg-pov-surface border border-pov-border rounded-2xl p-4 sm:p-5 ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border ${statusClass}`}>
              {statusLabel}
            </span>
            <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border ${roleClass}`}>
              {roleLabel}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-pov-text truncate">
            {title || 'Shared session room'}
          </h2>
          <p className="text-sm text-pov-muted mt-1 leading-relaxed max-w-2xl">
            {hostLabel} controls the session sync. Everyone in the room follows the same session state,
            while each person can still focus on their own POV.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
          <InfoPill label="Session" value={sessionCode} />
          <InfoPill label="Host" value={hostLabel} />
          <InfoPill label="State" value={secondaryLabel || statusLabel} />
        </div>
      </div>
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="rounded-xl border border-pov-border/60 bg-pov-bg/60 px-3 py-2 min-w-0">
      <p className="text-[9px] font-mono uppercase tracking-wider text-pov-muted">{label}</p>
      <p className="text-xs sm:text-sm font-medium text-pov-text truncate mt-0.5">{value}</p>
    </div>
  );
}