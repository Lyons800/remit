import { createHash } from 'node:crypto';

import type {
  AdapterVerifiedApprovalFact,
  RequestingAgentExecutionFact,
} from '@remit/domain';
import { canonicalizeJson } from '@remit/protocol/hashing';

import {
  WORLD_AGENTBOOK_ADAPTER_ID,
  WORLD_AGENTBOOK_ADAPTER_VERSION,
  WORLD_AGENTBOOK_ADDRESS,
  WORLD_AGENTBOOK_BACKING_RECORD_SOURCE,
  WORLD_AGENTBOOK_CHAIN_ID,
  WORLD_AGENTBOOK_NUMERIC_CHAIN_ID,
  WORLD_AGENTBOOK_REGISTRY_ID,
} from './constants.js';
import {
  validateTrustedWorldDeploymentContext,
  type TrustedWorldDeploymentContext,
} from './human-approval.js';
import type { VersionedScopedWorldPrincipal } from './privacy.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const compositionPolicyBrand = Symbol('world-authority-composition-policy');
const admissionBundleBrand = Symbol('world-authority-admission-bundle');
const admissionWriterBrand = Symbol('world-authority-admission-writer');
const compositionPolicies = new WeakSet<object>();
const admissionBundles = new WeakSet<object>();
const admissionWriters = new WeakSet<object>();

export type WorldAgentBookBoundaryPolicy = Readonly<{
  adapterId: typeof WORLD_AGENTBOOK_ADAPTER_ID;
  adapterVersion: typeof WORLD_AGENTBOOK_ADAPTER_VERSION;
  backingRecordSource: typeof WORLD_AGENTBOOK_BACKING_RECORD_SOURCE;
  networkId: typeof WORLD_AGENTBOOK_CHAIN_ID;
  numericChainId: typeof WORLD_AGENTBOOK_NUMERIC_CHAIN_ID;
  registryAddress: typeof WORLD_AGENTBOOK_ADDRESS;
  registryId: typeof WORLD_AGENTBOOK_REGISTRY_ID;
}>;

export type TrustedWorldAuthorityCompositionPolicy = Readonly<{
  agentBook: WorldAgentBookBoundaryPolicy;
  policyId: string;
  worldDeployment: TrustedWorldDeploymentContext;
  worldDeploymentId: string;
  [compositionPolicyBrand]: true;
}>;

export type WorldAgentBookAdmissionEvidence = Readonly<{
  adapterId: string;
  adapterVersion: string;
  agentAddress: `0x${string}`;
  backingRecordId: string;
  backingRecordSource: string;
  expiresAt: string;
  networkId: string;
  numericChainId: number;
  purpose: 'APPROVAL' | 'REQUESTER';
  registryAddress: `0x${string}`;
  registryId: string;
  verifiedAt: string;
}>;

export type WorldAuthorityIdentityClaims = Readonly<{
  actionDigest: string;
  approval: Readonly<{
    actionHumanPrincipals: readonly VersionedScopedWorldPrincipal[];
    agentKitChallengeId: string;
    agentTenantPrincipals: readonly VersionedScopedWorldPrincipal[];
    approvalId: string;
    approvalSessionId: string;
    consumptionClaimId: string;
    decisionId: string;
    subjectId: string;
    worldProofId: string;
  }>;
  compositionPolicyId: string;
  organizationId: string;
  requester: Readonly<{
    agentId: string;
    agentKitChallengeId: string;
    agentTenantPrincipals: readonly VersionedScopedWorldPrincipal[];
    factId: string;
    subjectId: string;
  }>;
  worldDeploymentId: string;
}>;

type WorldAuthorityAdmissionBundleCore = Readonly<{
  agentBookEvidence: Readonly<{
    approval: WorldAgentBookAdmissionEvidence;
    requester: WorldAgentBookAdmissionEvidence;
  }>;
  approvalFact: AdapterVerifiedApprovalFact;
  compositionPolicyId: string;
  identityClaims: WorldAuthorityIdentityClaims;
  kind: 'WORLD_AUTHORITY_ADMISSION';
  requesterFact: RequestingAgentExecutionFact;
  schemaVersion: 1;
  verifiedAt: string;
  worldDeploymentId: string;
}>;

export type VerifiedWorldAuthorityAdmissionBundle =
  WorldAuthorityAdmissionBundleCore &
    Readonly<{
      bundleDigest: string;
      [admissionBundleBrand]: true;
    }>;

export type WorldAuthorityAdmissionReceipt = Readonly<{
  atomicGroupId: string;
  bundleDigest: string;
  committedAt: string;
  status: 'committed';
  writerId: string;
}>;

export type WorldAuthorityAdmissionWriteResult =
  | WorldAuthorityAdmissionReceipt
  | Readonly<{
      reason: 'BUNDLE_INVALID' | 'CONFLICT' | 'WRITE_REJECTED';
      status: 'rejected';
    }>
  | Readonly<{ status: 'unavailable' }>;

export type WorldAuthorityAdmissionWriter = Readonly<{
  admit: (
    bundle: VerifiedWorldAuthorityAdmissionBundle,
  ) => Promise<WorldAuthorityAdmissionWriteResult>;
  writerId: string;
  [admissionWriterBrand]: true;
}>;

type WorldAuthorityAdmissionWriterInput = Readonly<{
  writeAtomically: (
    bundle: VerifiedWorldAuthorityAdmissionBundle,
  ) => Promise<unknown>;
  writerId: string;
}>;

function hashValue(domain: string, value: unknown): string {
  const hash = createHash('sha256');
  hash.update(domain, 'ascii');
  hash.update(Uint8Array.of(0));
  hash.update(canonicalizeJson(value), 'utf8');
  return hash.digest('hex');
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024;
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function hasExactStringKeys(
  value: object,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index])
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null) {
    return true;
  }
  if (seen.has(value)) {
    return true;
  }
  seen.add(value);
  if (!Object.isFrozen(value)) {
    return false;
  }
  return Reflect.ownKeys(value).every((key) =>
    isDeepFrozen((value as Record<PropertyKey, unknown>)[key], seen),
  );
}

function createAgentBookBoundaryPolicy(): WorldAgentBookBoundaryPolicy {
  return Object.freeze({
    adapterId: WORLD_AGENTBOOK_ADAPTER_ID,
    adapterVersion: WORLD_AGENTBOOK_ADAPTER_VERSION,
    backingRecordSource: WORLD_AGENTBOOK_BACKING_RECORD_SOURCE,
    networkId: WORLD_AGENTBOOK_CHAIN_ID,
    numericChainId: WORLD_AGENTBOOK_NUMERIC_CHAIN_ID,
    registryAddress: WORLD_AGENTBOOK_ADDRESS,
    registryId: WORLD_AGENTBOOK_REGISTRY_ID,
  });
}

export function createWorldAuthorityCompositionPolicy(
  worldDeployment: TrustedWorldDeploymentContext,
): TrustedWorldAuthorityCompositionPolicy {
  const validation = validateTrustedWorldDeploymentContext(worldDeployment);
  if (!validation.ok) {
    throw new Error('World deployment boundary is not trusted.');
  }
  const deployment = validation.context;
  const agentBook = createAgentBookBoundaryPolicy();
  const policyId = `world-authority-policy:${hashValue(
    'invoiceguard:world-authority-composition-policy:v1',
    {
      agentBook,
      worldDeploymentId: deployment.deploymentId,
    },
  )}`;
  const policy = Object.freeze({
    agentBook,
    policyId,
    worldDeployment: deployment,
    worldDeploymentId: deployment.deploymentId,
    [compositionPolicyBrand]: true as const,
  });
  compositionPolicies.add(policy);
  return policy;
}

export function validateWorldAuthorityCompositionPolicy(
  value: unknown,
): value is TrustedWorldAuthorityCompositionPolicy {
  if (
    !isRecord(value) ||
    !compositionPolicies.has(value) ||
    !Object.isFrozen(value) ||
    value[compositionPolicyBrand] !== true ||
    Reflect.ownKeys(value).length !== 5 ||
    !hasExactStringKeys(value, [
      'agentBook',
      'policyId',
      'worldDeployment',
      'worldDeploymentId',
    ])
  ) {
    return false;
  }
  const deploymentValidation = validateTrustedWorldDeploymentContext(
    value.worldDeployment,
  );
  if (
    !deploymentValidation.ok ||
    value.worldDeploymentId !== deploymentValidation.context.deploymentId ||
    !isRecord(value.agentBook) ||
    canonicalizeJson(value.agentBook) !==
      canonicalizeJson(createAgentBookBoundaryPolicy())
  ) {
    return false;
  }
  return (
    value.policyId ===
    `world-authority-policy:${hashValue(
      'invoiceguard:world-authority-composition-policy:v1',
      {
        agentBook: value.agentBook,
        worldDeploymentId: value.worldDeploymentId,
      },
    )}`
  );
}

export function createVerifiedWorldAuthorityAdmissionBundle(
  coreInput: WorldAuthorityAdmissionBundleCore,
): VerifiedWorldAuthorityAdmissionBundle {
  const core = deepFreeze({
    ...coreInput,
    agentBookEvidence: {
      approval: { ...coreInput.agentBookEvidence.approval },
      requester: { ...coreInput.agentBookEvidence.requester },
    },
    identityClaims: {
      ...coreInput.identityClaims,
      approval: {
        ...coreInput.identityClaims.approval,
        actionHumanPrincipals:
          coreInput.identityClaims.approval.actionHumanPrincipals.map(
            (claim) => ({ ...claim }),
          ),
        agentTenantPrincipals:
          coreInput.identityClaims.approval.agentTenantPrincipals.map(
            (claim) => ({ ...claim }),
          ),
      },
      requester: {
        ...coreInput.identityClaims.requester,
        agentTenantPrincipals:
          coreInput.identityClaims.requester.agentTenantPrincipals.map(
            (claim) => ({ ...claim }),
          ),
      },
    },
  });
  const bundleDigest = hashValue(
    'invoiceguard:world-authority-admission-bundle:v1',
    core,
  );
  const bundle = Object.freeze({
    ...core,
    bundleDigest,
    [admissionBundleBrand]: true as const,
  });
  admissionBundles.add(bundle);
  return bundle;
}

export function validateVerifiedWorldAuthorityAdmissionBundle(
  value: unknown,
): value is VerifiedWorldAuthorityAdmissionBundle {
  if (
    !isRecord(value) ||
    !admissionBundles.has(value) ||
    value[admissionBundleBrand] !== true ||
    Reflect.ownKeys(value).length !== 11 ||
    !hasExactStringKeys(value, [
      'agentBookEvidence',
      'approvalFact',
      'bundleDigest',
      'compositionPolicyId',
      'identityClaims',
      'kind',
      'requesterFact',
      'schemaVersion',
      'verifiedAt',
      'worldDeploymentId',
    ]) ||
    value.kind !== 'WORLD_AUTHORITY_ADMISSION' ||
    value.schemaVersion !== 1 ||
    typeof value.bundleDigest !== 'string' ||
    !SHA256_PATTERN.test(value.bundleDigest) ||
    !isDeepFrozen(value)
  ) {
    return false;
  }
  const core = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'bundleDigest'),
  );
  return (
    value.bundleDigest ===
    hashValue('invoiceguard:world-authority-admission-bundle:v1', core)
  );
}

function normalizeWriteResult(
  value: unknown,
  bundle: VerifiedWorldAuthorityAdmissionBundle,
  writerId: string,
): WorldAuthorityAdmissionWriteResult {
  if (!isRecord(value)) {
    return Object.freeze({ reason: 'WRITE_REJECTED', status: 'rejected' });
  }
  if (value.status === 'unavailable' && hasExactStringKeys(value, ['status'])) {
    return Object.freeze({ status: 'unavailable' });
  }
  if (
    value.status === 'rejected' &&
    hasExactStringKeys(value, ['reason', 'status']) &&
    (value.reason === 'CONFLICT' || value.reason === 'WRITE_REJECTED')
  ) {
    return Object.freeze({ reason: value.reason, status: 'rejected' });
  }
  if (
    value.status !== 'committed' ||
    !hasExactStringKeys(value, [
      'atomicGroupId',
      'bundleDigest',
      'committedAt',
      'status',
      'writerId',
    ]) ||
    !isNonemptyString(value.atomicGroupId) ||
    value.bundleDigest !== bundle.bundleDigest ||
    !isCanonicalInstant(value.committedAt) ||
    value.committedAt < bundle.verifiedAt ||
    value.writerId !== writerId
  ) {
    return Object.freeze({ reason: 'WRITE_REJECTED', status: 'rejected' });
  }
  return Object.freeze({
    atomicGroupId: value.atomicGroupId,
    bundleDigest: value.bundleDigest,
    committedAt: value.committedAt,
    status: 'committed',
    writerId: value.writerId,
  });
}

export function createWorldAuthorityAdmissionWriter({
  writeAtomically,
  writerId,
}: WorldAuthorityAdmissionWriterInput): WorldAuthorityAdmissionWriter {
  if (!isNonemptyString(writerId) || typeof writeAtomically !== 'function') {
    throw new Error('World authority admission writer is invalid.');
  }
  const writer = Object.freeze({
    async admit(
      bundle: VerifiedWorldAuthorityAdmissionBundle,
    ): Promise<WorldAuthorityAdmissionWriteResult> {
      if (!validateVerifiedWorldAuthorityAdmissionBundle(bundle)) {
        return Object.freeze({
          reason: 'BUNDLE_INVALID',
          status: 'rejected',
        });
      }
      try {
        const result = await writeAtomically(bundle);
        return normalizeWriteResult(result, bundle, writerId);
      } catch {
        return Object.freeze({ status: 'unavailable' });
      }
    },
    writerId,
    [admissionWriterBrand]: true as const,
  });
  admissionWriters.add(writer);
  return writer;
}

export function validateWorldAuthorityAdmissionWriter(
  value: unknown,
): value is WorldAuthorityAdmissionWriter {
  return (
    isRecord(value) &&
    admissionWriters.has(value) &&
    Object.isFrozen(value) &&
    value[admissionWriterBrand] === true &&
    Reflect.ownKeys(value).length === 3 &&
    hasExactStringKeys(value, ['admit', 'writerId']) &&
    typeof value.admit === 'function' &&
    isNonemptyString(value.writerId)
  );
}
