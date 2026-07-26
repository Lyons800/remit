import { serve } from '@hono/node-server';
import { parseServiceRuntime } from '@remit/runtime-config';

import { createExtractionWorkerApp } from './app.js';

const runtime = parseServiceRuntime({
  defaultPort: 4150,
  env: process.env,
  liveReady: false,
  portVariable: 'EXTRACTION_WORKER_PORT',
  service: 'extraction-worker',
});

serve({
  fetch: createExtractionWorkerApp(runtime).fetch,
  port: runtime.port,
});
