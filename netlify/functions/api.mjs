/**
 * Netlify Function: the POV Sync REST API.
 *
 * netlify.toml rewrites /api/* here, so every route defined in
 * server/src/app.js is reachable at its normal path. serverless-http adapts the
 * Express (req, res) contract to the Lambda-style handler Netlify invokes.
 */
import serverless from 'serverless-http';
import { createApp } from '../../server/src/app.js';

// Built once per container and reused across warm invocations.
const app = createApp();

export const handler = serverless(app, {
  // The client never sends binary bodies; letting serverless-http decide would
  // otherwise base64-encode responses it can't classify.
  binary: false,
});
