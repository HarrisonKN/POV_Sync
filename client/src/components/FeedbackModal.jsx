import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';

const FEEDBACK_TYPES = [
  { id: 'suggestion', label: 'Suggestion' },
  { id: 'bug', label: 'Bug report' },
  { id: 'general', label: 'General feedback' },
];

const MAX_MESSAGE_LENGTH = 1000;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MAX_PAGE_PATH_LENGTH = 200;
const FEEDBACK_COOLDOWN_MS = 30_000;

function sanitizeSingleLine(value, maxLength) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeMultiline(value, maxLength, { trimEdges = false } = {}) {
  const sanitized = String(value ?? '')
    .normalize('NFKC')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, maxLength);

  return trimEdges ? sanitized.trim() : sanitized;
}

export default function FeedbackModal({ open, onClose, user, profile, pagePath, getAccessToken }) {
  const defaultEmail = user?.email ?? '';
  const defaultName = profile?.display_name ?? '';
  const [feedbackType, setFeedbackType] = useState('suggestion');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [displayName, setDisplayName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);

  useEffect(() => {
    if (!open) return;
    setFeedbackType('suggestion');
    setMessage('');
    setEmail(defaultEmail);
    setDisplayName(defaultName);
    setSubmitError('');
    setSubmitted(false);
  }, [open, defaultEmail, defaultName]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const lastSubmittedAt = Number(localStorage.getItem('povsync.feedbackLastSubmittedAt') || 0);
    const updateCooldown = () => {
      const remaining = Math.max(0, lastSubmittedAt + FEEDBACK_COOLDOWN_MS - Date.now());
      setCooldownRemainingMs(remaining);
    };

    updateCooldown();
    const timer = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(timer);
  }, [open, submitted]);

  const sanitizedMessage = useMemo(() => sanitizeMultiline(message, MAX_MESSAGE_LENGTH, { trimEdges: true }), [message]);
  const canSubmit = useMemo(() => sanitizedMessage.length >= 10 && !submitting && cooldownRemainingMs <= 0, [sanitizedMessage, submitting, cooldownRemainingMs]);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedMessage = sanitizeMultiline(message, MAX_MESSAGE_LENGTH, { trimEdges: true });
    const trimmedEmail = sanitizeSingleLine(email, MAX_EMAIL_LENGTH).toLowerCase();
    const trimmedDisplayName = sanitizeSingleLine(displayName, MAX_DISPLAY_NAME_LENGTH);
    const trimmedPagePath = sanitizeSingleLine(pagePath || window.location.pathname, MAX_PAGE_PATH_LENGTH);

    if (trimmedMessage.length < 10) {
      setSubmitError('Please include a little more detail so we can act on it.');
      return;
    }

    if (cooldownRemainingMs > 0) {
      setSubmitError(`Please wait ${Math.ceil(cooldownRemainingMs / 1000)} seconds before sending more feedback.`);
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    const accessToken = typeof getAccessToken === 'function' ? await getAccessToken() : null;
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        feedbackType,
        displayName: trimmedDisplayName || null,
        email: trimmedEmail || null,
        message: trimmedMessage,
        pagePath: trimmedPagePath || null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setSubmitError(data.error || 'Unable to send feedback right now.');
      setSubmitting(false);
      return;
    }

    localStorage.setItem('povsync.feedbackLastSubmittedAt', String(Date.now()));
    setCooldownRemainingMs(FEEDBACK_COOLDOWN_MS);
    setSubmitted(true);
    setSubmitting(false);
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full max-w-lg rounded-2xl border border-pov-border bg-pov-surface p-5 shadow-2xl shadow-black/30"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-pov-accent">Feedback</p>
                <h2 className="mt-1 text-lg font-semibold text-pov-text">Help shape POVSync</h2>
                <p className="mt-1 text-sm text-pov-muted">Send suggestions, report rough edges, or tell us what would make your setup easier. If you leave a contact email, we may use it only to follow up on your feedback.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-pov-border bg-pov-bg px-2.5 py-1.5 text-xs font-mono text-pov-muted transition-colors hover:bg-pov-border/30 hover:text-pov-text"
              >
                Close
              </button>
            </div>

            {submitted ? (
              <div className="mt-5 rounded-xl border border-pov-success/25 bg-pov-success/8 px-4 py-4">
                <p className="text-sm font-medium text-pov-text">Thanks — your feedback has been sent.</p>
                <p className="mt-1 text-sm text-pov-muted">We’ll use it to improve the product and prioritise fixes. If you included a contact email, we may reach out if we need more detail.</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 rounded-lg bg-pov-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-pov-accent/85"
                >
                  Done
                </button>
              </div>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-pov-muted">Type</label>
                  <div className="inline-flex flex-wrap overflow-hidden rounded-xl border border-pov-border bg-pov-bg">
                    {FEEDBACK_TYPES.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setFeedbackType(option.id)}
                        className={`border-r border-pov-border px-3 py-2 text-xs font-mono transition-colors last:border-r-0 ${feedbackType === option.id ? 'bg-pov-accent/15 text-pov-accent' : 'text-pov-muted hover:bg-pov-border/30 hover:text-pov-text'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-pov-muted">Name</span>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(event) => setDisplayName(sanitizeSingleLine(event.target.value, MAX_DISPLAY_NAME_LENGTH))}
                      placeholder="Optional"
                      maxLength={MAX_DISPLAY_NAME_LENGTH}
                      className="w-full rounded-xl border border-pov-border bg-pov-bg px-3 py-2.5 text-sm text-pov-text outline-none transition-colors placeholder:text-pov-muted/50 focus:border-pov-accent/50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-pov-muted">Contact email (optional)</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(sanitizeSingleLine(event.target.value, MAX_EMAIL_LENGTH))}
                      placeholder="Used only if we need to follow up"
                      maxLength={MAX_EMAIL_LENGTH}
                      className="w-full rounded-xl border border-pov-border bg-pov-bg px-3 py-2.5 text-sm text-pov-text outline-none transition-colors placeholder:text-pov-muted/50 focus:border-pov-accent/50"
                    />
                    <span className="mt-1.5 block text-[11px] leading-relaxed text-pov-muted">
                      {defaultEmail
                        ? `Prefilled from your account (${defaultEmail}). You can change or clear it before sending.`
                        : 'Leave this blank if you do not want a follow-up.'}
                    </span>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-pov-muted">Message</span>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(sanitizeMultiline(event.target.value, MAX_MESSAGE_LENGTH))}
                    placeholder="What would make POVSync better?"
                    rows={6}
                    maxLength={MAX_MESSAGE_LENGTH}
                    className="w-full resize-y rounded-xl border border-pov-border bg-pov-bg px-3 py-2.5 text-sm text-pov-text outline-none transition-colors placeholder:text-pov-muted/50 focus:border-pov-accent/50"
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-pov-muted">
                    <span>Minimum 10 characters.</span>
                    <span>{sanitizedMessage.length}/{MAX_MESSAGE_LENGTH}</span>
                  </div>
                </label>

                {submitError && (
                  <div className="rounded-xl border border-pov-danger/25 bg-pov-danger/8 px-3 py-2 text-sm text-pov-danger">
                    {submitError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="rounded-xl bg-pov-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pov-accent/85 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? 'Sending…' : cooldownRemainingMs > 0 ? `Wait ${Math.ceil(cooldownRemainingMs / 1000)}s` : 'Send feedback'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}