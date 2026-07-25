import { serve } from '@hono/node-server';
import { parseServiceRuntime } from '@invoiceguard/runtime-config';

import { createFacilitatorApp } from './app.js';

const runtime = parseServiceRuntime({
  defaultPort: 4300,
  env: process.env,
  liveReady: false,
  portVariable: 'X402_FACILITATOR_PORT',
  service: 'x402-facilitator',
});

serve({
  fetch: createFacilitatorApp(runtime).fetch,
  port: runtime.port,
});
