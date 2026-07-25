import { z } from 'zod';

const adapterModeSchema = z.enum(['inactive', 'fake', 'live']);
const buildShaSchema = z.union([
  z.literal('local'),
  z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u),
]);
const portSchema = z
  .string()
  .regex(/^[1-9]\d{0,4}$/u)
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535));
const serviceNameSchema = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/u);

export type AdapterMode = z.infer<typeof adapterModeSchema>;

export type ServiceRuntime = Readonly<{
  adapterMode: AdapterMode;
  buildSha: string;
  port: number;
  service: string;
}>;

type RuntimeIdentity = Pick<ServiceRuntime, 'adapterMode' | 'buildSha'>;

export type LivenessReport = Readonly<
  RuntimeIdentity & {
    service: string;
    status: 'alive';
  }
>;

export type ReadinessReport = Readonly<
  RuntimeIdentity & {
    ready: false;
    reason: 'foundation_shell';
    service: string;
    status: 'not_ready';
  }
>;

type ParseServiceRuntimeOptions = Readonly<{
  defaultPort: number;
  env: Readonly<Record<string, string | undefined>>;
  liveReady: boolean;
  portVariable: string;
  service: string;
}>;

function parseOrThrow<T>(
  schema: z.ZodType<T>,
  value: unknown,
  variable: string,
  expectation: string,
): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new Error(`${variable} ${expectation}.`);
  }

  return result.data;
}

export function parseServiceRuntime({
  defaultPort,
  env,
  liveReady,
  portVariable,
  service,
}: ParseServiceRuntimeOptions): ServiceRuntime {
  const adapterMode = parseOrThrow(
    adapterModeSchema,
    env.INVOICEGUARD_DEMO_MODE,
    'INVOICEGUARD_DEMO_MODE',
    'must be inactive, fake, or live',
  );

  if (adapterMode === 'live' && !liveReady) {
    throw new Error(`${service} has not passed its live integration gate.`);
  }

  const rawBuildSha =
    env.INVOICEGUARD_BUILD_SHA ??
    (adapterMode === 'live' ? undefined : 'local');
  const buildSha = parseOrThrow(
    buildShaSchema,
    rawBuildSha,
    'INVOICEGUARD_BUILD_SHA',
    'must be local or a complete lowercase Git commit hash',
  );

  if (adapterMode === 'live' && buildSha === 'local') {
    throw new Error(
      'INVOICEGUARD_BUILD_SHA must identify the deployed commit.',
    );
  }

  const validatedService = parseOrThrow(
    serviceNameSchema,
    service,
    'service',
    'must be a lowercase kebab-case identifier',
  );
  const validatedDefaultPort = parseOrThrow(
    portSchema,
    String(defaultPort),
    'defaultPort',
    'must be a canonical integer from 1 to 65535',
  );
  const rawPort =
    env[portVariable] ??
    (adapterMode === 'live' ? undefined : String(validatedDefaultPort));
  const port = parseOrThrow(
    portSchema,
    rawPort,
    portVariable,
    'must be a canonical integer from 1 to 65535',
  );

  return Object.freeze({
    adapterMode,
    buildSha,
    port,
    service: validatedService,
  });
}

export function createLivenessReport(
  runtime: RuntimeIdentity,
  service: string,
): LivenessReport {
  return Object.freeze({
    adapterMode: runtime.adapterMode,
    buildSha: runtime.buildSha,
    service,
    status: 'alive',
  });
}

export function createReadinessReport(
  runtime: RuntimeIdentity,
  service: string,
): ReadinessReport {
  return Object.freeze({
    adapterMode: runtime.adapterMode,
    buildSha: runtime.buildSha,
    ready: false,
    reason: 'foundation_shell',
    service,
    status: 'not_ready',
  });
}
