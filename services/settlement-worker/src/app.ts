import {
  createLivenessReport,
  createReadinessReport,
  type ServiceRuntime,
} from '@remit/runtime-config';
import { Hono } from 'hono';

export function createSettlementWorkerApp(
  runtime: Pick<ServiceRuntime, 'adapterMode' | 'buildSha'>,
): Hono {
  const app = new Hono();

  app.get('/livez', (context) =>
    context.json(createLivenessReport(runtime, 'settlement-worker')),
  );
  app.get('/readyz', (context) =>
    context.json(createReadinessReport(runtime, 'settlement-worker'), 503),
  );

  return app;
}
