import {
  createLivenessReport,
  createReadinessReport,
  type ServiceRuntime,
} from '@remit/runtime-config';
import { Hono } from 'hono';

export function createExtractionWorkerApp(
  runtime: Pick<ServiceRuntime, 'adapterMode' | 'buildSha'>,
): Hono {
  const app = new Hono();

  app.get('/livez', (context) =>
    context.json(createLivenessReport(runtime, 'extraction-worker')),
  );
  app.get('/readyz', (context) =>
    context.json(createReadinessReport(runtime, 'extraction-worker'), 503),
  );

  return app;
}
