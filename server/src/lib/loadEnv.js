import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidatePaths = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../.env.local'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../.env.local'),
];

export function loadServerEnv() {
  for (const envPath of candidatePaths) {
    dotenv.config({ path: envPath, override: false });
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