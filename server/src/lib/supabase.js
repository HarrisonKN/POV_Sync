import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in server env');
}

// Public server client: anon key, no privileged bypass.
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

// Admin client: service role key, only for explicit trusted server paths.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Backwards-compatible alias for existing explicit admin usage.
export const supabase = supabaseAdmin;

export function createUserClient(accessToken) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
