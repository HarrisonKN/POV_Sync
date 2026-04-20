import { Router } from 'express';
import { createUserClient, supabaseAdmin } from '../lib/supabase.js';
import { createExpressRateLimit } from '../lib/rateLimit.js';

const router = Router();

const FEEDBACK_MESSAGE_MAX_LENGTH = 1000;
const FEEDBACK_DISPLAY_NAME_MAX_LENGTH = 80;
const FEEDBACK_EMAIL_MAX_LENGTH = 254;
const FEEDBACK_PAGE_PATH_MAX_LENGTH = 200;
const FEEDBACK_USER_AGENT_MAX_LENGTH = 512;
const FEEDBACK_TYPES = new Set(['suggestion', 'bug', 'general']);
const SIMPLE_EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PAGE_PATH_RE = /^\/[A-Za-z0-9/_?&=+#.%:-]*$/;

const feedbackRateLimit = createExpressRateLimit({
  windowMs: 10 * 60_000,
  max: Number(process.env.FEEDBACK_RATE_LIMIT_MAX || 5),
  keyPrefix: 'feedback-submit',
  keyGenerator: (req) => req.ip || 'unknown',
  message: 'Too many feedback submissions. Please try again later.',
});

function sanitizeSingleLine(value, maxLength) {
  const normalized = String(value ?? '').normalize('NFKC');
  return normalized
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeMultiline(value, maxLength) {
  const normalized = String(value ?? '').normalize('NFKC');
  return normalized
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

async function resolveOptionalUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  const userClient = createUserClient(token);
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) {
    return null;
  }

  return { id: data.user.id, email: data.user.email ?? null };
}

router.post('/', feedbackRateLimit, async (req, res) => {
  try {
    const resolvedUser = await resolveOptionalUser(req);
    const feedbackType = sanitizeSingleLine(req.body.feedbackType, 24).toLowerCase();
    const displayName = sanitizeSingleLine(req.body.displayName, FEEDBACK_DISPLAY_NAME_MAX_LENGTH) || null;
    const email = sanitizeSingleLine(req.body.email, FEEDBACK_EMAIL_MAX_LENGTH).toLowerCase() || null;
    const pagePath = sanitizeSingleLine(req.body.pagePath, FEEDBACK_PAGE_PATH_MAX_LENGTH) || null;
    const userAgent = sanitizeSingleLine(req.body.userAgent || req.get('user-agent'), FEEDBACK_USER_AGENT_MAX_LENGTH) || null;
    const message = sanitizeMultiline(req.body.message, FEEDBACK_MESSAGE_MAX_LENGTH);

    if (!FEEDBACK_TYPES.has(feedbackType)) {
      return res.status(400).json({ error: 'Invalid feedback type' });
    }

    if (message.length < 10) {
      return res.status(400).json({ error: 'Feedback message must be at least 10 characters' });
    }

    if (email && !SIMPLE_EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid contact email' });
    }

    if (pagePath && !PAGE_PATH_RE.test(pagePath)) {
      return res.status(400).json({ error: 'Invalid page path' });
    }

    const { error } = await supabaseAdmin
      .from('feedback_submissions')
      .insert({
        user_id: resolvedUser?.id ?? null,
        email,
        display_name: displayName,
        feedback_type: feedbackType,
        message,
        page_path: pagePath,
        user_agent: userAgent,
      });

    if (error) {
      console.error('[Feedback] Insert failed:', error);
      return res.status(500).json({ error: 'Unable to send feedback right now.' });
    }

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('[Feedback] Submission failed:', error);
    return res.status(500).json({ error: 'Unable to send feedback right now.' });
  }
});

export default router;