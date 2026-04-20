export default function AnchorDeadBanner({ streams, onPromote, onDismiss }) {
  const candidates = streams.filter((s) => !s.is_anchor);

  return (
    <div className="mt-3 bg-pov-danger/10 border border-pov-danger/40 rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-pov-danger mb-1">
            Anchor stream ended
          </p>
          <p className="text-xs text-pov-muted mb-3">
            The reference stream is no longer available. Promote a replacement anchor to keep sync running.
          </p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((stream) => (
              <button
                key={stream.id}
                onClick={() => onPromote(stream.id)}
                className="text-xs font-mono bg-pov-surface border border-pov-border rounded px-3 py-1.5 text-pov-text hover:border-pov-accent hover:text-pov-accent transition-colors"
              >
                Set {stream.display_name} as anchor
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-pov-muted/50 hover:text-pov-muted text-lg leading-none flex-shrink-0 transition-colors"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
