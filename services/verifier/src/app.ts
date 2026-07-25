import {
  createLivenessReport,
  createReadinessReport,
  type ServiceRuntime,
} from '@invoiceguard/runtime-config';
import { Hono } from 'hono';

export function createVerifierApp(
  runtime: Pick<ServiceRuntime, 'adapterMode' | 'buildSha'>,
): Hono {
  const app = new Hono();

  app.get('/livez', (context) =>
    context.json(createLivenessReport(runtime, 'verifier')),
  );
  app.get('/readyz', (context) =>
    context.json(createReadinessReport(runtime, 'verifier'), 503),
  );

  return app;
}
