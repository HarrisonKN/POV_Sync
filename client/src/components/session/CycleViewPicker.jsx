export default function CycleViewPicker({
  streams,
  activeStreamId,
  infoStreamId,
  visible,
  onHoverStream,
  onLeave,
  onSelectStream,
}) {
  const infoStream = streams.find((stream) => stream.id === infoStreamId) ?? streams[0] ?? null;

  return (
    <div
      className={`absolute inset-x-3 bottom-3 z-30 rounded-[1.35rem] border border-white/12 bg-black/35 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl transition-opacity duration-200 sm:inset-x-4 sm:bottom-4 sm:p-3.5 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onMouseEnter={() => infoStreamId && onHoverStream(infoStreamId)}
      onMouseLeave={onLeave}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/55">POV Picker</p>
          <p className="truncate text-sm font-semibold text-white sm:text-[15px]">
            {infoStream?.display_name || 'Select a POV'}
          </p>
          <p className="mt-1 text-[11px] text-white/45">
            Swipe, tap the arrows, or use ← and →.
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-mono uppercase tracking-[0.16em] text-pov-success">
          {Math.max(streams.findIndex((stream) => stream.id === activeStreamId), 0) + 1} / {streams.length}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {streams.map((stream, index) => {
          const isActive = stream.id === activeStreamId;
          return (
            <button
              key={stream.id}
              type="button"
              onMouseEnter={() => onHoverStream(stream.id)}
              onFocus={() => onHoverStream(stream.id)}
              onClick={() => onSelectStream(stream.id)}
              className={`rounded-2xl border px-3 py-3 text-left transition-all ${
                isActive
                  ? 'border-pov-accent/80 bg-pov-accent/16 shadow-[inset_0_0_0_1px_rgba(108,92,231,0.25)]'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
              }`}
            >
              <span className="mb-1 block text-[10px] font-mono uppercase tracking-[0.16em] text-white/48">
                POV {index + 1}
              </span>
              <span className="block truncate text-sm font-semibold text-white">{stream.display_name}</span>
              <span className="mt-1 block truncate text-[11px] text-white/50">
                {isActive ? 'Current selection' : 'Tap to switch'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
