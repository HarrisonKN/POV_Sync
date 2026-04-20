import { OFFSET_STEPS } from "../../../../shared/constants.js";

/**
 * Per-stream offset step controls shown below each filmstrip thumbnail.
 * Anchor stream shows controls as disabled — it is the reference point.
 */
export default function OffsetControls({ streamId, isAnchor, offset, onStep, onPromoteAnchor }) {
  const fmt = (s) => {
    const sign = s >= 0 ? '+' : '';
    return `${sign}${s.toFixed(2)}s`;
  };

  const primaryButtons = [
    { label: '-5s', delta: +OFFSET_STEPS.MEDIUM, title: 'Move back 5 seconds' },
    { label: '-1s', delta: +OFFSET_STEPS.FINE,   title: 'Move back 1 second' },
    { label: '+1s', delta: -OFFSET_STEPS.FINE,   title: 'Move forward 1 second' },
    { label: '+5s', delta: -OFFSET_STEPS.MEDIUM, title: 'Move forward 5 seconds' },
  ];

  const frameButtons = [
    { label: '-1f', delta: +OFFSET_STEPS.FRAME, title: 'Move back 1 frame' },
    { label: '+1f', delta: -OFFSET_STEPS.FRAME, title: 'Move forward 1 frame' },
  ];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-0.5 px-0.5">
        <span className={`text-[10px] font-mono ${isAnchor ? 'text-pov-muted/40' : 'text-pov-accent'}`}>
          {isAnchor ? 'anchor' : fmt(offset)}
        </span>
        <div className="flex items-center gap-1">
          {!isAnchor && (
            <button
              onClick={() => onPromoteAnchor(streamId)}
              title="Promote to anchor"
              className="text-[8px] font-mono text-pov-muted/50 hover:text-pov-muted border border-pov-border/50 rounded px-1 py-0.5 leading-none transition-colors"
            >
              anchor
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1">
        {primaryButtons.map(({ label, delta, title }) => (
          <button
            key={label}
            title={title}
            disabled={isAnchor}
            onClick={() => onStep(streamId, delta)}
            className="flex-1 text-[10px] font-mono bg-pov-bg border border-pov-border rounded py-1 px-1.5 text-pov-muted hover:text-pov-text hover:border-pov-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="text-[8px] font-mono uppercase tracking-wide text-pov-muted/60">
          Frame nudge
        </span>
        <div className="flex gap-1">
          {frameButtons.map(({ label, delta, title }) => (
            <button
              key={label}
              title={title}
              disabled={isAnchor}
              onClick={() => onStep(streamId, delta)}
              className="min-w-[42px] text-[9px] font-mono bg-pov-bg border border-pov-border rounded py-0.5 px-1.5 text-pov-muted hover:text-pov-text active:bg-pov-accent/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
