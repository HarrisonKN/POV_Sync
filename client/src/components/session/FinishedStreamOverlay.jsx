/**
 * FinishedStreamOverlay
 * Rendered on top of a filmstrip card when a stream's video has ended
 * (is_active === false during a live session).
 *
 * - All viewers see the "Ended" badge.
 * - Host also sees Replay / Replace / Clear action buttons.
 */
export default function FinishedStreamOverlay({ isHost, onReplay, onReplace, onClear }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[inherit] bg-black/65 backdrop-blur-[2px]">
      {/* Badge */}
      <span className="mb-3 rounded-full border border-white/15 bg-black/50 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-white/70">
        Ended
      </span>

      {/* Host actions */}
      {isHost && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReplay?.(); }}
            className="rounded-lg border border-pov-accent/40 bg-pov-accent/15 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide text-pov-accent transition hover:bg-pov-accent/25"
          >
            Replay
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReplace?.(); }}
            className="rounded-lg border border-white/15 bg-white/8 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide text-white/80 transition hover:bg-white/15"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear?.(); }}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide text-red-300/80 transition hover:bg-red-500/20"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
