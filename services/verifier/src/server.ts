import { serve } from '@hono/node-server';
import { parseServiceRuntime } from '@invoiceguard/runtime-config';

import { createVerifierApp } from './app.js';

const runtime = parseServiceRuntime({
  defaultPort: 4200,
  env: process.env,
  liveReady: false,
  portVariable: 'VERIFIER_PORT',
  service: 'verifier',
});

serve({
  fetch: createVerifierApp(runtime).fetch,
  port: runtime.port,
});
