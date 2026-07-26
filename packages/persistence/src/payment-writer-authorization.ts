import { isDeepStrictEqual } from 'node:util';

import type {
  PaymentActionAggregate,
  PaymentDomainEffect,
} from '@remit/domain';

import { PersistenceError } from './errors.js';

declare const paymentWriterAuthorizationBrand: unique symbol;
declare const paymentWriterRepositoryTrustBrand: unique symbol;

export type PaymentWriterAuthorization = Readonly<{
  [paymentWriterAuthorizationBrand]: true;
}>;

export type PaymentWriterRepositoryTrust = Readonly<{
  [paymentWriterRepositoryTrustBrand]: true;
}>;

export type PaymentWriterProcessPolicy = Readonly<{
  permittedEffectAdapterIds: readonly string[];
  permittedEffectTypes: readonly PaymentDomainEffect['type'][];
  permittedFactAdapterIds: readonly string[];
  processId: string;
}>;

export type PaymentWriterAuthorizationBoundary = Readonly<{
  issue(processId: string): PaymentWriterAuthorization;
  repositoryTrust: PaymentWriterRepositoryTrust;
}>;

type CompiledPolicy = Readonly<{
  permittedEffectAdapterIds: ReadonlySet<string>;
  permittedEffectTypes: ReadonlySet<PaymentDomainEffect['type']>;
  permittedFactAdapterIds: ReadonlySet<string>;
  processId: string;
}>;

const authorizationRecords = new WeakMap<
  object,
  Readonly<{ boundary: object; policy: CompiledPolicy }>
>();
const trustRecords = new WeakMap<object, Readonly<{ boundary: object }>>();

function requireIdentifier(value: string, field: string): void {
  if (
    value.length === 0 ||
    value.length > 256 ||
    value !== value.trim() ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === undefined || codePoint < 32 || codePoint === 127;
    })
  ) {
    throw new TypeError(`${field} must contain 1 to 256 printable characters`);
  }
}

function compilePolicy(input: PaymentWriterProcessPolicy): CompiledPolicy {
  requireIdentifier(input.processId, 'processId');
  for (const adapterId of [
    ...input.permittedEffectAdapterIds,
    ...input.permittedFactAdapterIds,
  ]) {
    requireIdentifier(adapterId, 'adapterId');
  }
  return Object.freeze({
    permittedEffectAdapterIds: new Set(input.permittedEffectAdapterIds),
    permittedEffectTypes: new Set(input.permittedEffectTypes),
    permittedFactAdapterIds: new Set(input.permittedFactAdapterIds),
    processId: input.processId,
  });
}

export function createPaymentWriterAuthorizationBoundary(
  policies: readonly PaymentWriterProcessPolicy[],
): PaymentWriterAuthorizationBoundary {
  if (policies.length === 0) {
    throw new TypeError(
      'at least one payment writer process policy is required',
    );
  }
  const compiled = new Map<string, CompiledPolicy>();
  for (const input of policies) {
    const policy = compilePolicy(input);
    if (compiled.has(policy.processId)) {
      throw new TypeError(
        `duplicate payment writer process: ${policy.processId}`,
      );
    }
    compiled.set(policy.processId, policy);
  }

  const boundary = Object.freeze({});
  const repositoryTrust = Object.freeze({}) as PaymentWriterRepositoryTrust;
  trustRecords.set(repositoryTrust, Object.freeze({ boundary }));

  return Object.freeze({
    issue(processId: string): PaymentWriterAuthorization {
      const policy = compiled.get(processId);
      if (policy === undefined) {
        throw new PersistenceError(
          'UNAUTHORIZED_WRITER',
          'payment writer process is not admitted by composition policy',
        );
      }
      const authorization = Object.freeze({}) as PaymentWriterAuthorization;
      authorizationRecords.set(
        authorization,
        Object.freeze({ boundary, policy }),
      );
      return authorization;
    },
    repositoryTrust,
  });
}

function collectAdapterBindings(
  value: unknown,
  path: string,
  bindings: Map<
    string,
    Readonly<{ adapterId: string; record: Readonly<Record<string, unknown>> }>
  >,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectAdapterBindings(item, `${path}[${index}]`, bindings),
    );
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record['adapterId'] === 'string') {
    bindings.set(
      path,
      Object.freeze({ adapterId: record['adapterId'], record }),
    );
  }
  for (const [key, item] of Object.entries(record)) {
    collectAdapterBindings(item, `${path}.${key}`, bindings);
  }
}

function changedFactAdapterIds(
  current: PaymentActionAggregate,
  target: PaymentActionAggregate,
): ReadonlySet<string> {
  const before = new Map<
    string,
    Readonly<{ adapterId: string; record: Readonly<Record<string, unknown>> }>
  >();
  const after = new Map<
    string,
    Readonly<{ adapterId: string; record: Readonly<Record<string, unknown>> }>
  >();
  collectAdapterBindings(current, '$', before);
  collectAdapterBindings(target, '$', after);
  return new Set(
    [...after.entries()]
      .filter(
        ([path, binding]) =>
          !isDeepStrictEqual(before.get(path)?.record, binding.record),
      )
      .map(([, { adapterId }]) => adapterId),
  );
}

function effectAdapterIds(
  current: PaymentActionAggregate,
  effects: readonly PaymentDomainEffect[],
): ReadonlySet<string> {
  const adapters = new Set<string>();
  for (const effect of effects) {
    const nested = new Map<
      string,
      Readonly<{ adapterId: string; record: Readonly<Record<string, unknown>> }>
    >();
    collectAdapterBindings(effect, '$', nested);
    for (const { adapterId } of nested.values()) {
      adapters.add(adapterId);
    }
    if (effect.type === 'VERIFICATION_QUOTE_REQUEST') {
      adapters.add(effect.serviceId);
    }
    if (effect.type === 'EXECUTION_AUDIT_REQUEST') {
      const auditAdapter = current.authorizationAudit?.adapterId;
      if (auditAdapter !== undefined) {
        adapters.add(auditAdapter);
      }
    }
  }
  return adapters;
}

export function assertAuthorizedPaymentWrite(
  repositoryTrust: PaymentWriterRepositoryTrust,
  authorization: PaymentWriterAuthorization,
  current: PaymentActionAggregate,
  target: PaymentActionAggregate,
  effects: readonly PaymentDomainEffect[],
): void {
  const trust = trustRecords.get(repositoryTrust);
  const record = authorizationRecords.get(authorization);
  if (
    trust === undefined ||
    record === undefined ||
    trust.boundary !== record.boundary
  ) {
    throw new PersistenceError(
      'UNAUTHORIZED_WRITER',
      'payment write requires an opaque authorization from the configured boundary',
    );
  }
  const unauthorizedEffect = effects.find(
    ({ type }) => !record.policy.permittedEffectTypes.has(type),
  );
  if (unauthorizedEffect !== undefined) {
    throw new PersistenceError(
      'UNAUTHORIZED_WRITER',
      `payment writer process is not permitted to emit ${unauthorizedEffect.type}`,
    );
  }
  for (const adapterId of changedFactAdapterIds(current, target)) {
    if (!record.policy.permittedFactAdapterIds.has(adapterId)) {
      throw new PersistenceError(
        'UNAUTHORIZED_WRITER',
        `payment writer process is not permitted to persist fact adapter ${adapterId}`,
      );
    }
  }
  for (const adapterId of effectAdapterIds(current, effects)) {
    if (!record.policy.permittedEffectAdapterIds.has(adapterId)) {
      throw new PersistenceError(
        'UNAUTHORIZED_WRITER',
        `payment writer process is not permitted to dispatch effect adapter ${adapterId}`,
      );
    }
  }
}
