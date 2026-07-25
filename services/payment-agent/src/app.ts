import {
  createLivenessReport,
  createReadinessReport,
  type ServiceRuntime,
} from '@invoiceguard/runtime-config';
import { Hono } from 'hono';

export function createPaymentAgentApp(
  runtime: Pick<ServiceRuntime, 'adapterMode' | 'buildSha'>,
): Hono {
  const app = new Hono();

  app.get('/livez', (context) =>
    context.json(createLivenessReport(runtime, 'payment-agent')),
  );
  app.get('/readyz', (context) =>
    context.json(createReadinessReport(runtime, 'payment-agent'), 503),
  );

  return app;
}
