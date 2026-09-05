import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Absolute URLs in the OG/Twitter tags have to point at wherever this build is
// actually served from. Netlify sets URL (production) and DEPLOY_PRIME_URL
// (branch + deploy previews) during the build, so the tags follow the deploy
// without anyone editing index.html.
const siteUrl = (
  process.env.VITE_SITE_URL
  || process.env.DEPLOY_PRIME_URL
  || process.env.URL
  || 'http://localhost:5173'
).replace(/\/+$/, '');

/** Replaces the __SITE_URL__ placeholder in index.html at build time. */
function siteUrlPlugin() {
  return {
    name: 'povsync-site-url',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.split('__SITE_URL__').join(siteUrl),
    },
  };
}

export default defineConfig({
  plugins: [react(), siteUrlPlugin()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the local Express server during `npm run dev`.
      // Under `netlify dev` the API is served by the Netlify function instead,
      // and that proxy takes precedence over this one.
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
});
