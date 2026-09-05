import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

/**
 * Resolve the .env files to try, relative to this module.
 *
 * Wrapped in try/catch because bundlers (esbuild, used by Netlify Functions)
 * can leave `import.meta.url` pointing somewhere that isn't a real file path.
 * There are no .env files on a serverless host anyway — the platform injects
 * the variables directly — so an empty candidate list is a fine outcome.
 */
function resolveCandidatePaths() {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    return [
      path.resolve(dir, '../../.env'),
      path.resolve(dir, '../../.env.local'),
      path.resolve(dir, '../../../.env'),
      path.resolve(dir, '../../../.env.local'),
    ];
  } catch (_) {
    return [];
  }
}

const candidatePaths = resolveCandidatePaths();

export function loadServerEnv() {
  // On Netlify (and any other managed host) the environment is already
  // populated; reading dotenv files there would only add noise.
  if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) return;

  for (const envPath of candidatePaths) {
    try {
      dotenv.config({ path: envPath, override: false, quiet: true });
    } catch (_) {
      // A missing or unreadable .env is not an error — env may come from elsewhere.
    }
  }
}

export function getServerEnvDiagnostics() {
  return {
    candidatePaths,
    present: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      YOUTUBE_API_KEY: !!process.env.YOUTUBE_API_KEY,
    },
  };
}
