import { OFFSET_STEPS } from '../../../shared/constants.js';

const PRIMARY_BUTTONS = [
  { label: '-5s', delta: -OFFSET_STEPS.MEDIUM, title: 'Move back 5 seconds' },
  { label: '-1s', delta: -OFFSET_STEPS.FINE, title: 'Move back 1 second' },
  { label: '+1s', delta: OFFSET_STEPS.FINE, title: 'Move forward 1 second' },
  { label: '+5s', delta: OFFSET_STEPS.MEDIUM, title: 'Move forward 5 seconds' },
];

const FRAME_BUTTONS = [
  { label: '-1f', delta: -OFFSET_STEPS.FRAME, title: 'Move back 1 frame' },
  { label: '+1f', delta: OFFSET_STEPS.FRAME, title: 'Move forward 1 frame' },
];

export default function PlaybackControls({
  title,
  description,
  activeLabel,
  onStep,
  onGoLive,
  onResync,
  showLiveActions = false,
  goLiveLabel = 'Go live',
  resyncLabel = 'Re-sync',
}) {
  return (
    <div className="bg-pov-surface border border-pov-border rounded-lg p-3 sm:p-4 mt-2 sm:mt-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] sm:text-xs font-mono text-pov-muted uppercase tracking-wider">
            {title}
          </p>
          {description && (
            <p className="mt-1 text-[11px] sm:text-xs text-pov-muted leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {activeLabel && (
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-pov-border bg-pov-bg px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-pov-text">
            <span className="text-pov-muted">Current POV</span>
            <span className="max-w-[180px] truncate text-pov-accent">{activeLabel}</span>
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {PRIMARY_BUTTONS.map(({ label, delta, title: buttonTitle }) => (
          <button
            key={label}
            type="button"
            title={buttonTitle}
            onClick={() => onStep(delta)}
            className="text-[10px] sm:text-xs font-mono bg-pov-bg border border-pov-border rounded px-3 py-2 text-pov-text hover:border-pov-muted active:bg-pov-accent/10 transition-colors min-h-[36px]"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-mono uppercase tracking-wide text-pov-muted/60">
            Frame nudge
          </span>
          {FRAME_BUTTONS.map(({ label, delta, title: buttonTitle }) => (
            <button
              key={label}
              type="button"
              title={buttonTitle}
              onClick={() => onStep(delta)}
              className="min-w-[42px] text-[9px] font-mono bg-pov-bg border border-pov-border rounded py-1 px-1.5 text-pov-muted hover:text-pov-text active:bg-pov-accent/10 transition-colors whitespace-nowrap"
            >
              {label}
            </button>
          ))}
        </div>

        {showLiveActions && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onGoLive}
              className="text-[10px] sm:text-xs font-mono bg-pov-bg border border-pov-border text-pov-text hover:bg-pov-border/30 rounded px-2.5 sm:px-3 py-1.5 transition-colors"
            >
              {goLiveLabel}
            </button>
            <button
              type="button"
              onClick={onResync}
              className="text-[10px] sm:text-xs font-mono bg-pov-bg border border-pov-border text-pov-text hover:bg-pov-border/30 rounded px-2.5 sm:px-3 py-1.5 transition-colors"
            >
              {resyncLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}