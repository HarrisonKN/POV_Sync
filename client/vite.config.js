import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Replaces the __SITE_URL__ placeholder in index.html at build time. */
function siteUrlPlugin(siteUrl) {
  return {
    name: 'povsync-site-url',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.split('__SITE_URL__').join(siteUrl),
    },
  };
}

export default defineConfig(({ mode }) => {
  // .env files are NOT applied to process.env while this config is evaluated,
  // so read them explicitly. The empty prefix also pulls in unprefixed vars,
  // which is how Netlify's URL / DEPLOY_PRIME_URL are picked up. This object is
  // only used below — what reaches the browser is still limited to VITE_*.
  const env = loadEnv(mode, process.cwd(), '');

  // Absolute URLs in the OG/Twitter tags have to point at wherever this build is
  // actually served from. Netlify sets URL (production) and DEPLOY_PRIME_URL
  // (branch + deploy previews) during the build, so the tags follow the deploy
  // without anyone editing index.html.
  const siteUrl = (
    env.VITE_SITE_URL
    || env.DEPLOY_PRIME_URL
    || env.URL
    || 'http://localhost:5173'
  ).replace(/\/+$/, '');

  return {
    plugins: [react(), siteUrlPlugin(siteUrl)],
    server: {
      port: 5173,
      proxy: {
        // Proxy API calls to the local Express server during `npm run dev`.
        // Under `netlify dev` the API is served by the Netlify function instead,
        // and that proxy takes precedence over this one.
        '/api': {
          target: env.VITE_DEV_API_TARGET || 'http://localhost:3002',
          changeOrigin: true,
        },
      },
    },
  };
});
