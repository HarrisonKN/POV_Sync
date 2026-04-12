import { useEffect, useRef } from 'react';

/**
 * Accessible confirmation / alert modal with backdrop.
 *
 * Props:
 *  - open:       boolean — whether the modal is visible
 *  - title:      heading text
 *  - message:    body text (string or ReactNode)
 *  - confirmLabel: text on the primary button  (default "Confirm")
 *  - cancelLabel:  text on the secondary button (default "Cancel")
 *  - variant:    'confirm' | 'alert' — alert hides the cancel button
 *  - onConfirm:  () => void — called when primary button is clicked
 *  - onCancel:   () => void — called when cancelled / backdrop clicked / Esc
 *  - destructive: boolean — if true the confirm button uses red styling
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'confirm',
  onConfirm,
  onCancel,
  destructive = false,
}) {
  const confirmRef = useRef(null);

  // Auto-focus the confirm button when the modal opens
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBtnClass = destructive
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-pov-accent hover:opacity-90 text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="bg-pov-card border border-pov-border rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h2
            id="confirm-modal-title"
            className="text-lg font-bold font-mono text-pov-text"
          >
            {title}
          </h2>
        )}

        {message && (
          <p className="text-sm text-pov-muted leading-relaxed">{message}</p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          {variant === 'confirm' && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-pov-muted hover:text-pov-text transition"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${confirmBtnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
