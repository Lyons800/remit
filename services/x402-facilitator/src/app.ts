import {
  createLivenessReport,
  createReadinessReport,
  type ServiceRuntime,
} from '@invoiceguard/runtime-config';
import { Hono } from 'hono';

export function createFacilitatorApp(
  runtime: Pick<ServiceRuntime, 'adapterMode' | 'buildSha'>,
): Hono {
  const app = new Hono();

  app.get('/livez', (context) =>
    context.json(createLivenessReport(runtime, 'x402-facilitator')),
  );
  app.get('/readyz', (context) =>
    context.json(createReadinessReport(runtime, 'x402-facilitator'), 503),
  );

  return app;
}
