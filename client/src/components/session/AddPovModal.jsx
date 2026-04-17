import { useEffect, useRef } from 'react';

export default function AddPovModal({
  open,
  url,
  displayName,
  error,
  submitting,
  onUrlChange,
  onDisplayNameChange,
  onSubmit,
  onCancel,
}) {
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (open) firstInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-pov-modal-title"
    >
      <form
        className="w-full max-w-md rounded-xl border border-pov-border bg-pov-card p-5 sm:p-6 shadow-2xl space-y-4"
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1">
          <h2 id="add-pov-modal-title" className="text-lg font-bold font-mono text-pov-text">
            Add another POV
          </h2>
          <p className="text-sm text-pov-muted">
            Drop in a YouTube or Twitch link to add it to this session.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[10px] sm:text-xs font-mono text-pov-muted uppercase tracking-wider">
            Stream URL
          </span>
          <input
            ref={firstInputRef}
            type="url"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-lg border border-pov-border bg-pov-bg px-3 py-2 text-sm text-pov-text outline-none transition focus:border-pov-accent"
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[10px] sm:text-xs font-mono text-pov-muted uppercase tracking-wider">
            Label
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder="POV 2"
            maxLength={40}
            className="w-full rounded-lg border border-pov-border bg-pov-bg px-3 py-2 text-sm text-pov-text outline-none transition focus:border-pov-accent"
          />
        </label>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-pov-muted hover:text-pov-text transition"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-pov-accent hover:opacity-90 text-white transition disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Adding...' : 'Add POV'}
          </button>
        </div>
      </form>
    </div>
  );
}
