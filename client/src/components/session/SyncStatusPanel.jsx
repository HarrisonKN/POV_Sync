import { useState } from 'react';

/**
 * Collapsible sync status panel — host only.
 * Shows per-stream: status, offset, start time availability.
 */
export default function SyncStatusPanel({
  streams,
  syncStats,
  session,
  onApplyLatestBaseline,
  applyingLatestBaseline,
  pendingLatestAnchorId,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const { offsets, startTimesAvailable, anchorStreamId, timestamp } = syncStats;
  const secAgo = timestamp ? Math.round((Date.now() - timestamp) / 1000) : null;

  const eligibleStreams = streams.filter((stream) => stream.platform !== 'twitch');
  const confirmedStreams = eligibleStreams.filter((stream) =>
    Number.isFinite(stream.youtube_start_time) && stream.youtube_start_time > 0
  );
  const latestConfirmedStream =
    [...confirmedStreams].sort((a, b) => b.youtube_start_time - a.youtube_start_time)[0] ?? null;
  const currentAnchor = streams.find((stream) => stream.id === anchorStreamId) ?? null;
  const vodReady = eligibleStreams.length > 0 && confirmedStreams.length === eligibleStreams.length;
  const anchorStartTime = Number.isFinite(currentAnchor?.youtube_start_time)
    ? currentAnchor.youtube_start_time
    : null;

  function statusFor(streamId) {
    const isAnchor = streamId === anchorStreamId;
    const stream = streams.find((s) => s.id === streamId);
    const isTwitch = stream?.platform === 'twitch';
    const hasLiveStart = Boolean(startTimesAvailable?.[streamId]);
    const hasPersistedStart =
      Number.isFinite(stream?.youtube_start_time) && stream.youtube_start_time > 0;

    if (isTwitch)
      return { dot: '●', color: 'text-pov-muted/40', label: 'Unsupported', detail: 'Twitch live timing is not persisted' };
    if (isAnchor && hasPersistedStart)
      return { dot: '⚓', color: 'text-pov-accent', label: 'Baseline', detail: 'Current room baseline' };
    if (isAnchor)
      return { dot: '⚓', color: 'text-pov-muted', label: 'Anchor', detail: 'Waiting for confirmed start time' };
    if (hasPersistedStart)
      return { dot: '●', color: 'text-pov-success', label: 'Confirmed', detail: 'Saved in Supabase and ready for VOD' };
    if (hasLiveStart)
      return { dot: '●', color: 'text-yellow-400', label: 'Saving', detail: 'Live start detected; waiting for Supabase confirmation' };
    return { dot: '●', color: 'text-pov-muted/40', label: 'Waiting', detail: 'Needs a stable YouTube start time' };
  }

  const fmtOffset = (v) => {
    if (v === null || v === undefined) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}s`;
  };

  const fmtUtc = (unixSeconds) => {
    if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return 'UTC pending';
    return new Date(unixSeconds * 1000).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
    });
  };

  const fmtRelativeToBaseline = (unixSeconds) => {
    if (!Number.isFinite(unixSeconds) || !Number.isFinite(anchorStartTime)) return 'Relative pending';
    const delta = Math.round((unixSeconds - anchorStartTime) * 10) / 10;
    if (Math.abs(delta) < 0.05) return 'Matches baseline';
    const sign = delta > 0 ? '+' : '−';
    return `${sign}${Math.abs(delta).toFixed(1)}s ${delta > 0 ? 'after' : 'before'} baseline`;
  };

  const liveDetectedCount = eligibleStreams.filter((s) => startTimesAvailable?.[s.id]).length;
  const pendingLabel = pendingLatestAnchorId
    ? streams.find((s) => s.id === pendingLatestAnchorId)?.display_name || 'selected POV'
    : null;

  return (
    <div className="bg-pov-surface border border-pov-border rounded-lg mt-2 sm:mt-3 overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-pov-bg/40 transition-colors"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <span className="text-[10px] sm:text-xs font-mono text-pov-muted uppercase tracking-wider">Sync Readiness</span>
          <span className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded border text-pov-accent border-pov-accent/30 bg-pov-accent/10">UTC</span>
          {eligibleStreams.length > 0 && (
            <span className={`text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              confirmedStreams.length === eligibleStreams.length
                ? 'text-pov-success border-pov-success/30 bg-pov-success/10'
                : 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
            }`}>
              {confirmedStreams.length}/{eligibleStreams.length} confirmed
            </span>
          )}
          {secAgo !== null && (
            <span className="text-[9px] sm:text-[10px] font-mono text-pov-muted/50 hidden sm:inline">
              updated {secAgo}s ago
            </span>
          )}
        </div>
        <span className="text-pov-muted/50 text-xs">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-pov-border px-3 sm:px-4 py-2 sm:py-3 overflow-x-auto">
          <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-pov-border/60 bg-pov-bg/60 px-3 py-2">
              <p className="text-[9px] font-mono uppercase tracking-wider text-pov-muted">Supabase</p>
              <p className="mt-1 text-sm font-semibold text-pov-text">{confirmedStreams.length}/{eligibleStreams.length || 0}</p>
              <p className="mt-1 text-[10px] text-pov-muted/70">Confirmed start times saved and ready for VOD.</p>
            </div>
            <div className="rounded-lg border border-pov-border/60 bg-pov-bg/60 px-3 py-2">
              <p className="text-[9px] font-mono uppercase tracking-wider text-pov-muted">Live Detection</p>
              <p className="mt-1 text-sm font-semibold text-pov-text">{liveDetectedCount}/{eligibleStreams.length || 0}</p>
              <p className="mt-1 text-[10px] text-pov-muted/70">YouTube start times seen by the live sync server.</p>
            </div>
            <div className="rounded-lg border border-pov-border/60 bg-pov-bg/60 px-3 py-2">
              <p className="text-[9px] font-mono uppercase tracking-wider text-pov-muted">Current Baseline</p>
              <p className="mt-1 truncate text-sm font-semibold text-pov-text">{currentAnchor?.display_name || 'Waiting for anchor'}</p>
              <p className="mt-1 text-[10px] text-pov-muted/70">{fmtUtc(currentAnchor?.youtube_start_time)}</p>
            </div>
            <div className="rounded-lg border border-pov-border/60 bg-pov-bg/60 px-3 py-2">
              <p className="text-[9px] font-mono uppercase tracking-wider text-pov-muted">Latest Confirmed</p>
              <p className="mt-1 truncate text-sm font-semibold text-pov-text">{latestConfirmedStream?.display_name || 'Waiting'}</p>
              <p className="mt-1 text-[10px] text-pov-muted/70">{fmtUtc(latestConfirmedStream?.youtube_start_time)}</p>
              <p className="mt-1 text-[10px] text-pov-muted/60">
                {latestConfirmedStream ? fmtRelativeToBaseline(latestConfirmedStream.youtube_start_time) : 'Best candidate for newest shared moment.'}
              </p>
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-2 rounded-xl border border-pov-border/60 bg-pov-bg/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-pov-muted">VOD Handoff</p>
              <p className="mt-1 text-sm font-semibold text-pov-text">
                {vodReady ? 'Ready to end as a synced VOD' : 'Waiting for all YouTube POVs to confirm'}
              </p>
              <p className="mt-1 text-[11px] text-pov-muted/75">
                {vodReady
                  ? 'Every eligible POV has a saved UTC start time. Apply the latest baseline or end the room.'
                  : 'Let each YouTube POV play past ~10 seconds until it shows Confirmed.'}
              </p>
              {pendingLabel && (
                <p className="mt-1 text-[11px] text-pov-accent/90">
                  Applying latest baseline from {pendingLabel}…
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onApplyLatestBaseline}
              disabled={!latestConfirmedStream || applyingLatestBaseline}
              className="rounded-lg border border-pov-accent/35 bg-pov-accent/10 px-3 py-2 text-[10px] sm:text-xs font-mono text-pov-text transition-colors hover:border-pov-accent/60 hover:bg-pov-accent/16 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {applyingLatestBaseline ? 'Applying…' : 'Use Latest Baseline'}
            </button>
          </div>

          <table className="w-full text-[10px] sm:text-[11px] font-mono">
            <thead>
              <tr className="text-pov-muted/60 text-left">
                <th className="pb-1.5 font-normal w-4" />
                <th className="pb-1.5 font-normal">Stream</th>
                <th className="pb-1.5 font-normal w-24">Live</th>
                <th className="pb-1.5 font-normal w-24">Supabase</th>
                <th className="pb-1.5 font-normal w-24">Role</th>
                <th className="pb-1.5 font-normal w-16 text-right">Offset</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((stream) => {
                const st = statusFor(stream.id);
                const offset = offsets[stream.id];
                const isAnchor = stream.id === anchorStreamId;
                const hasLiveStart = Boolean(startTimesAvailable?.[stream.id]);
                const hasPersistedStart =
                  Number.isFinite(stream.youtube_start_time) && stream.youtube_start_time > 0;
                const isTwitch = stream.platform === 'twitch';
                const relativeLabel = isAnchor ? 'Current baseline' : fmtRelativeToBaseline(stream.youtube_start_time);
                return (
                  <tr key={stream.id} className="border-t border-pov-border/40">
                    <td className={`py-1.5 pr-2 ${st.color}`}>{st.dot}</td>
                    <td className="py-1.5 pr-3">
                      <span className="text-pov-text truncate block max-w-[120px]">{stream.display_name}</span>
                      <span className="mt-0.5 block text-[9px] text-pov-muted/60">{fmtUtc(stream.youtube_start_time)}</span>
                      <span className="mt-0.5 block text-[9px] text-pov-muted/50">{isTwitch ? 'Live-only POV' : relativeLabel}</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={isTwitch ? 'text-pov-muted/40' : hasLiveStart ? 'text-pov-success' : 'text-pov-muted/40'}>
                        {isTwitch ? '—' : hasLiveStart ? 'Seen' : 'Waiting'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={isTwitch ? 'text-pov-muted/40' : hasPersistedStart ? 'text-pov-success' : hasLiveStart ? 'text-yellow-400' : 'text-pov-muted/40'}>
                        {isTwitch ? 'Unsupported' : hasPersistedStart ? 'Confirmed' : hasLiveStart ? 'Saving' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={st.color} title={st.detail}>{st.label}</span>
                    </td>
                    <td className={`py-1.5 text-right ${
                      isAnchor ? 'text-pov-muted/40' : offset != null ? 'text-pov-accent' : 'text-pov-muted/40'
                    }`}>
                      {isAnchor ? '0.00s' : fmtOffset(offset)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-2 pt-2 border-t border-pov-border/40">
            <span className="text-[9px] font-mono text-pov-muted/50">
              Confirmed = UTC start time stored in Supabase. Using the latest baseline recalculates offsets from the newest confirmed POV.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
