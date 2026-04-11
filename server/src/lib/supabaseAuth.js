import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Works with anon OR service role key

/**
 * Create a Supabase client authenticated as a specific user.
 * Uses the user's JWT access token so RLS policies (auth.uid()) work correctly.
 */
export function createAuthenticatedClient(accessToken) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Express middleware: extracts Bearer token from Authorization header
 * and attaches an authenticated Supabase client to req.supabase
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  console.log('[Auth] requireAuth — header present:', !!authHeader);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[Auth] Rejected — no Bearer token');
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  console.log('[Auth] Token received:', token.substring(0, 20) + '...');
  req.supabase = createAuthenticatedClient(token);
  req.accessToken = token;

  // Decode JWT payload (base64) to expose the user's sub/id without an extra library
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    req.supabaseUser = { id: payload.sub, email: payload.email };
  } catch (_) {
    req.supabaseUser = null;
  }

  next();
}
