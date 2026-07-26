import { serve } from '@hono/node-server';
import { parseServiceRuntime } from '@remit/runtime-config';

import { createSettlementWorkerApp } from './app.js';

const runtime = parseServiceRuntime({
  defaultPort: 4500,
  env: process.env,
  liveReady: false,
  portVariable: 'SETTLEMENT_WORKER_PORT',
  service: 'settlement-worker',
});

serve({
  fetch: createSettlementWorkerApp(runtime).fetch,
  port: runtime.port,
});
