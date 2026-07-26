import { serve } from '@hono/node-server';
import { parseServiceRuntime } from '@remit/runtime-config';

import { createPaymentAgentApp } from './app.js';

const runtime = parseServiceRuntime({
  defaultPort: 4400,
  env: process.env,
  liveReady: false,
  portVariable: 'PAYMENT_AGENT_PORT',
  service: 'payment-agent',
});

serve({
  fetch: createPaymentAgentApp(runtime).fetch,
  port: runtime.port,
});
