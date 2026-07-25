import { describe, expect, it } from 'vitest';

import { createControlApi } from '../../apps/control-api/src/app.js';
import { createExtractionWorkerApp } from '../../services/extraction-worker/src/app.js';
import { createPaymentAgentApp } from '../../services/payment-agent/src/app.js';
import { createSettlementWorkerApp } from '../../services/settlement-worker/src/app.js';
import { createVerifierApp } from '../../services/verifier/src/app.js';
import { createFacilitatorApp } from '../../services/x402-facilitator/src/app.js';

const runtime = {
  adapterMode: 'inactive',
  buildSha: 'local',
} as const;

const services = [
  ['control-api', createControlApi],
  ['extraction-worker', createExtractionWorkerApp],
  ['payment-agent', createPaymentAgentApp],
  ['settlement-worker', createSettlementWorkerApp],
  ['verifier', createVerifierApp],
  ['x402-facilitator', createFacilitatorApp],
] as const;

describe.each(services)('%s foundation process', (service, createApp) => {
  it('reports process liveness without claiming readiness', async () => {
    const response = await createApp(runtime).request('/livez');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      adapterMode: 'inactive',
      buildSha: 'local',
      service,
      status: 'alive',
    });
  });

  it('fails readiness while the process is only a foundation shell', async () => {
    const response = await createApp(runtime).request('/readyz');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      adapterMode: 'inactive',
      buildSha: 'local',
      ready: false,
      reason: 'foundation_shell',
      service,
      status: 'not_ready',
    });
  });

  it('does not expose an ambiguous health endpoint', async () => {
    const response = await createApp(runtime).request('/health');

    expect(response.status).toBe(404);
  });
});
