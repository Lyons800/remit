import {
  createLivenessReport,
  createReadinessReport,
  type ServiceRuntime,
} from '@remit/runtime-config';
import { Hono } from 'hono';

export function createControlApi(
  runtime: Pick<ServiceRuntime, 'adapterMode' | 'buildSha'>,
): Hono {
  const app = new Hono();

  app.get('/livez', (context) =>
    context.json(createLivenessReport(runtime, 'control-api')),
  );
  app.get('/readyz', (context) =>
    context.json(createReadinessReport(runtime, 'control-api'), 503),
  );

  return app;
}
