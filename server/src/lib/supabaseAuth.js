import { createUserClient, supabaseAdmin } from './supabase.js';

/**
 * Create a Supabase client authenticated as a specific user.
 * Uses the user's JWT access token so RLS policies (auth.uid()) work correctly.
 */
/**
 * Express middleware: extracts Bearer token from Authorization header
 * and attaches authenticated/user + admin Supabase clients to the request.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  const userClient = createUserClient(token);

  (async () => {
    const { data, error } = await userClient.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.supabase = userClient;
    req.supabaseAdmin = supabaseAdmin;
    req.supabaseUser = { id: data.user.id, email: data.user.email };
    req.accessToken = token;
    next();
  })().catch((err) => {
    console.error('[Auth] Verification failure:', err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  });
}
