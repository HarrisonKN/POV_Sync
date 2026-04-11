import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server env');
}

// Server-side client uses service role key — bypasses RLS
// Only use this on the server, never expose to the client
export const supabase = createClient(supabaseUrl, supabaseServiceKey);
