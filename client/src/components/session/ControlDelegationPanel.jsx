import { useState } from 'react';

export default function ControlDelegationPanel({ streams, session, controlHolderUserId, onDelegate, onRevoke }) {
  const [collapsed, setCollapsed] = useState(true);

  const participants = streams.filter((s) => s.user_id !== session?.host_id);
  if (participants.length === 0) return null;

  return (
    <div className="bg-pov-surface border border-pov-border rounded-lg mt-2 sm:mt-3 overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-pov-bg/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-pov-muted uppercase tracking-wider">
            Control Delegation
          </span>
          {controlHolderUserId && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-pov-accent/30 text-pov-accent bg-pov-accent/10">
              🎮 Active
            </span>
          )}
        </div>
        <span className="text-pov-muted/50 text-xs">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-pov-border px-4 py-3 space-y-2">
          <p className="text-[11px] text-pov-muted/70 mb-3">
            Temporarily hand full playback and sync controls to one participant. You can reclaim at any time.
          </p>
          {participants.map((stream) => {
            const isHolder = stream.user_id === controlHolderUserId;
            return (
              <div
                key={stream.id}
                className={`flex items-center justify-between py-1.5 px-2 rounded ${
                  isHolder ? 'bg-pov-accent/5 border border-pov-accent/20' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-pov-text">{stream.display_name}</span>
                  {isHolder && (
                    <span className="text-[10px] font-mono text-pov-accent">🎮 has controls</span>
                  )}
                </div>
                {isHolder ? (
                  <button
                    onClick={onRevoke}
                    className="text-xs font-mono border border-pov-danger/40 text-pov-danger bg-pov-danger/5 hover:bg-pov-danger/15 rounded px-3 py-1 transition-colors"
                  >
                    Reclaim
                  </button>
                ) : (
                  <button
                    onClick={() => onDelegate(stream.user_id, stream.display_name)}
                    disabled={!!controlHolderUserId}
                    className="text-xs font-mono border border-pov-border text-pov-muted hover:border-pov-muted hover:text-pov-text rounded px-3 py-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={controlHolderUserId ? 'Reclaim controls first before delegating to someone else' : ''}
                  >
                    Give Control
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
