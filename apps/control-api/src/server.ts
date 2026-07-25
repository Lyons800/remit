import { serve } from '@hono/node-server';
import { parseServiceRuntime } from '@invoiceguard/runtime-config';

import { createControlApi } from './app.js';

const runtime = parseServiceRuntime({
  defaultPort: 4100,
  env: process.env,
  liveReady: false,
  portVariable: 'CONTROL_API_PORT',
  service: 'control-api',
});

serve({
  fetch: createControlApi(runtime).fetch,
  port: runtime.port,
});
