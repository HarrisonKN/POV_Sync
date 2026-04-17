/**
 * Participant context bar shown below the room header for non-host participants.
 * When role === 'host', also renders kick buttons next to each participant row.
 */
export default function ParticipantBar({
  session,
  streams,
  effectiveSyncStats,
  controlHolderUserId,
  userId,
  role,
  onKick,
}) {
  const hostStream = streams.find((s) => s.user_id === session.host_id);
  const hostName = hostStream?.display_name ?? 'Host';

  const startTimesAvailable = effectiveSyncStats?.startTimesAvailable || {};
  const anchorId = effectiveSyncStats?.anchorStreamId;
  const nonAnchor = streams.filter((s) => s.id !== anchorId);
  const syncedCount = nonAnchor.filter((s) => startTimesAvailable[s.id]).length;
  const total = nonAnchor.length;

  const syncColor = total === 0 ? 'bg-pov-muted' : syncedCount === total ? 'bg-pov-success' : syncedCount > 0 ? 'bg-pov-warning' : 'bg-pov-danger';
  const syncLabel = total === 0 ? 'Waiting' : syncedCount === total ? 'Synced' : syncedCount > 0 ? 'Partial' : 'Waiting';

  const hasControl = !!controlHolderUserId && userId === controlHolderUserId;
  const isHost = role === 'host';

  // Host's participant management view — shows who's in the room with kick buttons
  if (isHost && streams.length > 1) {
    const participants = streams.filter((s) => s.user_id !== session.host_id);
    return (
      <div className="mb-2 sm:mb-3 bg-pov-surface border border-pov-border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-pov-muted mb-2">
          Participants ({participants.length})
        </p>
        <div className="flex flex-col gap-1.5">
          {participants.map((stream) => (
            <div key={stream.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${startTimesAvailable[stream.id] ? 'bg-pov-success' : 'bg-pov-muted/40'}`} />
                <span className="text-xs font-mono text-pov-text truncate">{stream.display_name}</span>
                {stream.user_id === controlHolderUserId && (
                  <span className="text-[10px] font-mono text-pov-accent flex-shrink-0">🎮</span>
                )}
              </div>
              {onKick && (
                <button
                  onClick={() => onKick(stream.id, stream.display_name)}
                  className="text-[10px] font-mono border border-pov-danger/30 text-pov-danger/70 hover:text-pov-danger hover:border-pov-danger/50 rounded px-2 py-0.5 transition-colors flex-shrink-0"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Participant's own status bar
  return (
    <div className="mb-2 sm:mb-3 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 bg-pov-surface border border-pov-border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-xs font-mono">
      <span className="text-pov-muted">
        Hosted by <span className="text-pov-text">{hostName}</span>
      </span>
      <span className="text-pov-border hidden sm:inline">|</span>
      <span className="flex items-center gap-1.5 text-pov-muted">
        <span className={`w-2 h-2 rounded-full ${syncColor}`} />
        {syncLabel}
      </span>
      <span className="text-pov-border hidden sm:inline">|</span>
      <span className="text-pov-muted">
        {streams.length} POV{streams.length !== 1 ? 's' : ''}
      </span>
      {hasControl && (
        <>
          <span className="text-pov-border hidden sm:inline">|</span>
          <span className="text-pov-accent flex items-center gap-1">
            <span className="text-[10px]">🎮</span>
            <span className="hidden sm:inline">You have controls</span>
            <span className="sm:hidden">Controls</span>
          </span>
        </>
      )}
    </div>
  );
}
