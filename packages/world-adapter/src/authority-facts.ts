import { createHash } from 'node:crypto';

import {
  actionFactBinding,
  createAdapterVerifiedApprovalFact,
  createRequestingAgentExecutionFact,
} from '@invoiceguard/domain';
import type { IDKitResult, ResponseItemV4 } from '@worldcoin/idkit-core';
import {
  canonicalizeJson,
  verifyAuthorizationBundle,
  type AuthorizationBundleV1,
} from '@invoiceguard/protocol/hashing';
import { getAddress, isAddress } from 'viem';

import {
  createVerifiedWorldAuthorityAdmissionBundle,
  validateWorldAuthorityAdmissionWriter,
  validateWorldAuthorityCompositionPolicy,
  type TrustedWorldAuthorityCompositionPolicy,
  type WorldAgentBookAdmissionEvidence,
  type WorldAgentBookBoundaryPolicy,
  type WorldAuthorityAdmissionReceipt,
  type WorldAuthorityAdmissionWriter,
  type WorldAuthorityIdentityClaims,
} from './authority-admission.js';
import {
  validateVerifiedAgentkitClaim,
  type VerifiedAgentkitClaim,
} from './agentkit.js';
import {
  validateWorldProofOfHumanRequest,
  type TrustedWorldDeploymentContext,
  type WorldHumanApprovalBinding,
  type WorldProofOfHumanRequest,
} from './human-approval.js';
import {
  createWorldPrincipalKeyring,
  deriveActionHumanPrincipalAliases,
  deriveAgentTenantPrincipalAliases,
  type ScopedWorldPrincipal,
  type VersionedScopedWorldPrincipal,
  type WorldPrincipalDerivationVersion,
  type WorldPrincipalKeyring,
} from './privacy.js';

export const WORLD_APPROVAL_ADAPTER_ID = 'world-approval-adapter' as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const HEX_IDENTIFIER_PATTERN = /^0x[0-9a-fA-F]+$/u;
const WORLD_PRINCIPAL_PATTERN = /^hmac-sha256:[A-Za-z0-9_-]{43}$/u;
const PROOF_OF_HUMAN_ISSUER_SCHEMA_ID = 1;
const MAXIMUM_UINT256 = (1n << 256n) - 1n;

type WorldIdKitResultV4 = Extract<
  IDKitResult,
  { action: string; protocol_version: '4.0' }
>;

export type VerifiedWorldCompanyAuthority = Readonly<{
  agentAddress: `0x${string}`;
  agentTenantPrincipal: ScopedWorldPrincipal;
  agentTenantPrincipalDerivationVersion: WorldPrincipalDerivationVersion;
  audience: string;
  credentialDigest: string;
  credentialId: string;
  expiresAt: string;
  grantDigest: string;
  grantId: string;
  grantVersion: number;
  notBefore: string;
  organizationId: string;
  role: string;
  scope: string;
  scopeActionDigest: string;
  subjectId: string;
}>;

export type WorldCompanyAuthorityRequirement = Readonly<{
  actionDigest: string;
  agentAddress: `0x${string}`;
  agentTenantPrincipal: ScopedWorldPrincipal;
  agentTenantPrincipalDerivationVersion: WorldPrincipalDerivationVersion;
  at: string;
  audience: string | null;
  grantDigest: string | null;
  grantId: string;
  grantVersion: number | null;
  kind: 'APPROVAL' | 'REQUESTER';
  organizationId: string;
  requiredRole: string;
  scope: string | null;
  subjectId: string;
}>;

export type WorldCompanyAuthorityResolution =
  | Readonly<{
      authority: VerifiedWorldCompanyAuthority;
      status: 'valid';
    }>
  | Readonly<{
      reason:
        | 'EXPIRED'
        | 'MISSING'
        | 'NOT_YET_VALID'
        | 'REVOKED'
        | 'SIGNATURE_INVALID';
      status: 'invalid';
    }>
  | Readonly<{ status: 'unavailable' }>;

export type WorldAgentBookAuthorityResolution =
  | Readonly<{
      agentBookAdapterId: string;
      agentBookAdapterVersion: string;
      agentAddress: `0x${string}`;
      backingRecordId: string;
      backingRecordSource: string;
      expiresAt: string;
      humanId: string;
      observedNetworkId: string;
      observedNumericChainId: number;
      registryAddress: `0x${string}`;
      registryId: string;
      status: 'backed';
      verifiedAt: string;
    }>
  | Readonly<{
      agentAddress: `0x${string}`;
      status: 'unregistered';
    }>
  | Readonly<{
      agentAddress: `0x${string}`;
      reason: 'LOOKUP_INDETERMINATE' | 'RPC_UNAVAILABLE' | 'WRONG_CHAIN';
      status: 'unavailable';
    }>;

export type WorldProofVerificationResult =
  | Readonly<{ status: 'verified' }>
  | Readonly<{ status: 'invalid' }>
  | Readonly<{ status: 'unavailable' }>;

export type WorldAuthorityAdmissionRefusal =
  | 'ADMISSION_REJECTED'
  | 'ADMISSION_UNAVAILABLE'
  | 'ADMISSION_WRITER_INVALID'
  | 'AGENTBOOK_BACKING_INVALID'
  | 'AGENTBOOK_BACKING_MISMATCH'
  | 'AGENTBOOK_PROVENANCE_MISMATCH'
  | 'AGENTBOOK_BACKING_UNAVAILABLE'
  | 'AGENTBOOK_UNREGISTERED'
  | 'AGENTKIT_CLAIM_INVALID'
  | 'AGENTKIT_CLAIM_MISMATCH'
  | 'AGENTKIT_CLAIM_STALE'
  | 'AUTHORIZATION_INVALID'
  | 'AUTHORITY_INVALID'
  | 'AUTHORITY_MISMATCH'
  | 'AUTHORITY_STALE'
  | 'AUTHORITY_UNAVAILABLE'
  | 'COMPOSITION_POLICY_INVALID'
  | 'DEPLOYMENT_INVALID'
  | 'INPUT_INVALID'
  | 'NOT_AN_APPROVAL'
  | 'POLICY_ROUTE_MISMATCH'
  | 'PRINCIPAL_KEYRING_INVALID'
  | 'REQUEST_INVALID'
  | 'VALIDITY_WINDOW_EMPTY'
  | 'WORLD_PROOF_INVALID'
  | 'WORLD_PROOF_MISMATCH'
  | 'WORLD_PROOF_STALE'
  | 'WORLD_PROOF_UNAVAILABLE';

export type WorldAuthorityAdmissionResult =
  | Readonly<{
      admission: WorldAuthorityAdmissionReceipt;
      ok: true;
    }>
  | Readonly<{
      ok: false;
      reason: WorldAuthorityAdmissionRefusal;
    }>;

export type VerifyAndAdmitWorldAuthorityInput = Readonly<{
  approval: Readonly<{
    agentkitClaim: VerifiedAgentkitClaim;
    proof: unknown;
    request: WorldProofOfHumanRequest;
  }>;
  authorization: AuthorizationBundleV1;
  now?: Date;
  requester: Readonly<{
    agentId: string;
    agentkitClaim: VerifiedAgentkitClaim;
  }>;
}>;

export type WorldAuthorityAdmissionDependencies = Readonly<{
  admissionWriter: WorldAuthorityAdmissionWriter;
  compositionPolicy: TrustedWorldAuthorityCompositionPolicy;
  principalKeyring: WorldPrincipalKeyring;
  resolveAgentBookBacking: (
    claim: VerifiedAgentkitClaim,
  ) => Promise<WorldAgentBookAuthorityResolution>;
  resolveCompanyAuthority: (
    requirement: WorldCompanyAuthorityRequirement,
  ) => Promise<WorldCompanyAuthorityResolution>;
  verifyWorldProof: (
    proof: WorldIdKitResultV4,
    deployment: TrustedWorldDeploymentContext,
  ) => Promise<WorldProofVerificationResult>;
}>;

type ParsedWorldProof = Readonly<{
  proof: WorldIdKitResultV4;
  response: ResponseItemV4;
}>;

type VerifiedBacking = Readonly<{
  aliases: readonly VersionedScopedWorldPrincipal[];
  evidence: WorldAgentBookAdmissionEvidence;
  recordId: string;
  resolution: Extract<WorldAgentBookAuthorityResolution, { status: 'backed' }>;
}>;

function refusal(
  reason: WorldAuthorityAdmissionRefusal,
): WorldAuthorityAdmissionResult {
  return Object.freeze({ ok: false, reason });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.every((key): key is string => typeof key === 'string') &&
    keys.length === expected.length &&
    [...keys].sort().every((key, index) => key === [...expected].sort()[index])
  );
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

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024;
}

function isCanonicalAddress(value: unknown): value is `0x${string}` {
  return (
    typeof value === 'string' &&
    isAddress(value, { strict: false }) &&
    getAddress(value) === value
  );
}

function sameAddress(left: string, right: string): boolean {
  return (
    isAddress(left, { strict: false }) &&
    isAddress(right, { strict: false }) &&
    getAddress(left) === getAddress(right)
  );
}

function hashRecord(domain: string, value: unknown): string {
  const hash = createHash('sha256');
  hash.update(domain, 'ascii');
  hash.update(Uint8Array.of(0));
  hash.update(canonicalizeJson(value), 'utf8');
  return hash.digest('hex');
}

function prefixedId(prefix: string, domain: string, value: unknown): string {
  return `${prefix}:${hashRecord(domain, value)}`;
}

function cloneValue(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return undefined;
  }
}

function parseNonzeroUint256(value: unknown): string | null {
  if (typeof value !== 'string' || !HEX_IDENTIFIER_PATTERN.test(value)) {
    return null;
  }
  const integer = BigInt(value);
  return integer > 0n && integer <= MAXIMUM_UINT256 ? value : null;
}

function parseWorldProof(
  value: unknown,
  request: WorldProofOfHumanRequest,
): ParsedWorldProof | null {
  const proof = cloneValue(value);
  if (
    !isRecord(proof) ||
    proof.protocol_version !== '4.0' ||
    'session_id' in proof ||
    proof.action !== request.binding.worldActionId ||
    proof.nonce !== request.config.rp_context.nonce ||
    proof.environment !== request.environment ||
    proof.user_presence_completed !== true ||
    !Array.isArray(proof.responses) ||
    proof.responses.length !== 1
  ) {
    return null;
  }

  const response = proof.responses[0];
  if (
    !isRecord(response) ||
    response.identifier !== 'proof_of_human' ||
    response.issuer_schema_id !== PROOF_OF_HUMAN_ISSUER_SCHEMA_ID ||
    response.signal_hash !== request.expectedSignalHash ||
    parseNonzeroUint256(response.nullifier) === null ||
    typeof response.expires_at_min !== 'number' ||
    !Number.isSafeInteger(response.expires_at_min) ||
    response.expires_at_min <= 0 ||
    !Array.isArray(response.proof) ||
    response.proof.length !== 5 ||
    !response.proof.every(
      (item) => typeof item === 'string' && HEX_IDENTIFIER_PATTERN.test(item),
    )
  ) {
    return null;
  }

  return Object.freeze({
    proof: proof as unknown as WorldIdKitResultV4,
    response: response as unknown as ResponseItemV4,
  });
}

function minimumExpiry(values: readonly string[]): string | null {
  const instants = values.map((value) => Date.parse(value));
  if (instants.some((instant) => !Number.isFinite(instant))) {
    return null;
  }
  return new Date(Math.min(...instants)).toISOString();
}

function exactInputShape(
  value: unknown,
): value is VerifyAndAdmitWorldAuthorityInput {
  return (
    isRecord(value) &&
    hasExactKeys(
      value,
      value.now === undefined
        ? ['approval', 'authorization', 'requester']
        : ['approval', 'authorization', 'now', 'requester'],
    ) &&
    isRecord(value.approval) &&
    hasExactKeys(value.approval, ['agentkitClaim', 'proof', 'request']) &&
    isRecord(value.requester) &&
    hasExactKeys(value.requester, ['agentId', 'agentkitClaim']) &&
    isNonemptyString(value.requester.agentId) &&
    (value.now === undefined || value.now instanceof Date)
  );
}

function isValidAuthority(
  value: unknown,
): value is VerifiedWorldCompanyAuthority {
  return (
    isRecord(value) &&
    isCanonicalAddress(value.agentAddress) &&
    typeof value.agentTenantPrincipal === 'string' &&
    WORLD_PRINCIPAL_PATTERN.test(value.agentTenantPrincipal) &&
    typeof value.agentTenantPrincipalDerivationVersion === 'string' &&
    /^v[1-9][0-9]{0,8}$/u.test(value.agentTenantPrincipalDerivationVersion) &&
    isNonemptyString(value.audience) &&
    typeof value.credentialDigest === 'string' &&
    SHA256_PATTERN.test(value.credentialDigest) &&
    isNonemptyString(value.credentialId) &&
    isCanonicalInstant(value.expiresAt) &&
    typeof value.grantDigest === 'string' &&
    SHA256_PATTERN.test(value.grantDigest) &&
    isNonemptyString(value.grantId) &&
    isPositiveSafeInteger(value.grantVersion) &&
    isCanonicalInstant(value.notBefore) &&
    isNonemptyString(value.organizationId) &&
    isNonemptyString(value.role) &&
    isNonemptyString(value.scope) &&
    typeof value.scopeActionDigest === 'string' &&
    SHA256_PATTERN.test(value.scopeActionDigest) &&
    isNonemptyString(value.subjectId)
  );
}

function authorityMatches(
  authority: VerifiedWorldCompanyAuthority,
  requirement: WorldCompanyAuthorityRequirement,
): boolean {
  return (
    sameAddress(authority.agentAddress, requirement.agentAddress) &&
    authority.agentTenantPrincipal === requirement.agentTenantPrincipal &&
    authority.agentTenantPrincipalDerivationVersion ===
      requirement.agentTenantPrincipalDerivationVersion &&
    authority.organizationId === requirement.organizationId &&
    authority.subjectId === requirement.subjectId &&
    authority.role === requirement.requiredRole &&
    authority.scopeActionDigest === requirement.actionDigest &&
    authority.grantId === requirement.grantId &&
    (requirement.audience === null ||
      authority.audience === requirement.audience) &&
    (requirement.grantDigest === null ||
      authority.grantDigest === requirement.grantDigest) &&
    (requirement.grantVersion === null ||
      authority.grantVersion === requirement.grantVersion) &&
    (requirement.scope === null || authority.scope === requirement.scope)
  );
}

async function resolveAuthority(
  requirement: WorldCompanyAuthorityRequirement,
  now: number,
  resolve: WorldAuthorityAdmissionDependencies['resolveCompanyAuthority'],
): Promise<
  | Readonly<{ authority: VerifiedWorldCompanyAuthority; ok: true }>
  | Readonly<{ ok: false; reason: WorldAuthorityAdmissionRefusal }>
> {
  let resolution: unknown;
  try {
    resolution = await resolve(requirement);
  } catch {
    return { ok: false, reason: 'AUTHORITY_UNAVAILABLE' };
  }
  if (
    !isRecord(resolution) ||
    resolution.status === 'unavailable' ||
    (resolution.status !== 'valid' && resolution.status !== 'invalid')
  ) {
    return {
      ok: false,
      reason:
        isRecord(resolution) && resolution.status === 'unavailable'
          ? 'AUTHORITY_UNAVAILABLE'
          : 'AUTHORITY_INVALID',
    };
  }
  if (resolution.status === 'invalid') {
    return { ok: false, reason: 'AUTHORITY_INVALID' };
  }
  if (!isValidAuthority(resolution.authority)) {
    return { ok: false, reason: 'AUTHORITY_INVALID' };
  }
  if (!authorityMatches(resolution.authority, requirement)) {
    return { ok: false, reason: 'AUTHORITY_MISMATCH' };
  }
  if (
    now < Date.parse(resolution.authority.notBefore) ||
    now >= Date.parse(resolution.authority.expiresAt)
  ) {
    return { ok: false, reason: 'AUTHORITY_STALE' };
  }
  return { authority: resolution.authority, ok: true };
}

async function resolveBacking(
  claim: VerifiedAgentkitClaim,
  organizationId: string,
  now: number,
  keyring: WorldPrincipalKeyring,
  boundary: WorldAgentBookBoundaryPolicy,
  expectedRegistryId: string,
  purpose: 'APPROVAL' | 'REQUESTER',
  resolve: WorldAuthorityAdmissionDependencies['resolveAgentBookBacking'],
): Promise<
  | Readonly<{ backing: VerifiedBacking; ok: true }>
  | Readonly<{ ok: false; reason: WorldAuthorityAdmissionRefusal }>
> {
  let resolution: unknown;
  try {
    resolution = await resolve(claim);
  } catch {
    return { ok: false, reason: 'AGENTBOOK_BACKING_UNAVAILABLE' };
  }
  if (!isRecord(resolution)) {
    return { ok: false, reason: 'AGENTBOOK_BACKING_INVALID' };
  }
  if (resolution.status === 'unavailable') {
    return { ok: false, reason: 'AGENTBOOK_BACKING_UNAVAILABLE' };
  }
  if (resolution.status === 'unregistered') {
    return { ok: false, reason: 'AGENTBOOK_UNREGISTERED' };
  }
  if (
    resolution.status !== 'backed' ||
    !hasExactKeys(resolution, [
      'agentBookAdapterId',
      'agentBookAdapterVersion',
      'agentAddress',
      'backingRecordId',
      'backingRecordSource',
      'expiresAt',
      'humanId',
      'observedNetworkId',
      'observedNumericChainId',
      'registryAddress',
      'registryId',
      'status',
      'verifiedAt',
    ]) ||
    !isNonemptyString(resolution.agentBookAdapterId) ||
    !isNonemptyString(resolution.agentBookAdapterVersion) ||
    !isCanonicalAddress(resolution.agentAddress) ||
    !isNonemptyString(resolution.backingRecordId) ||
    !isNonemptyString(resolution.backingRecordSource) ||
    !isCanonicalInstant(resolution.verifiedAt) ||
    !isCanonicalInstant(resolution.expiresAt) ||
    Date.parse(resolution.verifiedAt) > now ||
    now >= Date.parse(resolution.expiresAt) ||
    typeof resolution.humanId !== 'string' ||
    parseNonzeroUint256(resolution.humanId) === null ||
    !isNonemptyString(resolution.observedNetworkId) ||
    !isPositiveSafeInteger(resolution.observedNumericChainId) ||
    !isCanonicalAddress(resolution.registryAddress) ||
    !isNonemptyString(resolution.registryId)
  ) {
    return { ok: false, reason: 'AGENTBOOK_BACKING_INVALID' };
  }
  if (!sameAddress(resolution.agentAddress, claim.agentAddress)) {
    return { ok: false, reason: 'AGENTBOOK_BACKING_MISMATCH' };
  }
  if (
    resolution.agentBookAdapterId !== boundary.adapterId ||
    resolution.agentBookAdapterVersion !== boundary.adapterVersion ||
    resolution.backingRecordSource !== boundary.backingRecordSource ||
    resolution.observedNetworkId !== boundary.networkId ||
    resolution.observedNumericChainId !== boundary.numericChainId ||
    resolution.registryAddress !== boundary.registryAddress ||
    resolution.registryId !== boundary.registryId ||
    resolution.registryId !== expectedRegistryId
  ) {
    return { ok: false, reason: 'AGENTBOOK_PROVENANCE_MISMATCH' };
  }

  let aliases: readonly VersionedScopedWorldPrincipal[];
  try {
    aliases = deriveAgentTenantPrincipalAliases({
      humanId: resolution.humanId,
      keyring,
      organizationId,
    });
  } catch {
    return { ok: false, reason: 'AGENTBOOK_BACKING_INVALID' };
  }
  const evidence = Object.freeze({
    adapterId: resolution.agentBookAdapterId,
    adapterVersion: resolution.agentBookAdapterVersion,
    agentAddress: resolution.agentAddress,
    backingRecordId: resolution.backingRecordId,
    backingRecordSource: resolution.backingRecordSource,
    expiresAt: resolution.expiresAt,
    networkId: resolution.observedNetworkId,
    numericChainId: resolution.observedNumericChainId,
    purpose,
    registryAddress: resolution.registryAddress,
    registryId: resolution.registryId,
    verifiedAt: resolution.verifiedAt,
  });
  return {
    backing: Object.freeze({
      aliases,
      evidence,
      recordId: resolution.backingRecordId,
      resolution: resolution as Extract<
        WorldAgentBookAuthorityResolution,
        { status: 'backed' }
      >,
    }),
    ok: true,
  };
}

function exactClaim(
  value: unknown,
  actionDigest: string,
  organizationId: string,
  now: number,
): VerifiedAgentkitClaim | WorldAuthorityAdmissionRefusal {
  const validation = validateVerifiedAgentkitClaim(value);
  if (!validation.ok) {
    return 'AGENTKIT_CLAIM_INVALID';
  }
  const claim = validation.claim;
  if (
    claim.actionDigest !== actionDigest ||
    claim.organizationId !== organizationId
  ) {
    return 'AGENTKIT_CLAIM_MISMATCH';
  }
  if (now < Date.parse(claim.issuedAt) || now >= Date.parse(claim.expiresAt)) {
    return 'AGENTKIT_CLAIM_STALE';
  }
  return claim;
}

function currentAlias(
  aliases: readonly VersionedScopedWorldPrincipal[],
): VersionedScopedWorldPrincipal | null {
  return aliases[0] ?? null;
}

function includesAlias(
  aliases: readonly VersionedScopedWorldPrincipal[],
  principal: string,
  derivationVersion: string,
): boolean {
  return aliases.some(
    (alias) =>
      alias.principal === principal &&
      alias.derivationVersion === derivationVersion,
  );
}

function approvalRoleRequired(
  authorization: AuthorizationBundleV1,
  binding: WorldHumanApprovalBinding,
): boolean {
  return authorization.decision.requiredAuthority.roles.some(
    (requirement) => requirement.role === binding.requiredRole,
  );
}

function worldCredentialExpiry(response: ResponseItemV4): string | null {
  const milliseconds = response.expires_at_min * 1_000;
  if (!Number.isSafeInteger(milliseconds)) {
    return null;
  }
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    return null;
  }
}

export async function verifyAndAdmitWorldAuthority(
  input: VerifyAndAdmitWorldAuthorityInput,
  dependencies: WorldAuthorityAdmissionDependencies,
): Promise<WorldAuthorityAdmissionResult> {
  if (!exactInputShape(input)) {
    return refusal('INPUT_INVALID');
  }

  let authorization: AuthorizationBundleV1;
  try {
    authorization = verifyAuthorizationBundle(input.authorization);
  } catch {
    return refusal('AUTHORIZATION_INVALID');
  }
  if (authorization.decision.route !== 'HUMAN_APPROVAL') {
    return refusal('POLICY_ROUTE_MISMATCH');
  }

  if (
    !validateWorldAuthorityCompositionPolicy(dependencies.compositionPolicy)
  ) {
    return refusal('COMPOSITION_POLICY_INVALID');
  }
  if (!validateWorldAuthorityAdmissionWriter(dependencies.admissionWriter)) {
    return refusal('ADMISSION_WRITER_INVALID');
  }
  const compositionPolicy = dependencies.compositionPolicy;
  const deployment = compositionPolicy.worldDeployment;

  let keyring: WorldPrincipalKeyring;
  try {
    keyring = createWorldPrincipalKeyring(
      dependencies.principalKeyring.current,
      dependencies.principalKeyring.previous,
    );
  } catch {
    return refusal('PRINCIPAL_KEYRING_INVALID');
  }

  const nowDate = input.now ?? new Date();
  if (!Number.isFinite(nowDate.getTime())) {
    return refusal('INPUT_INVALID');
  }
  const now = nowDate.getTime();
  const verifiedAt = nowDate.toISOString();
  const actionDigest = authorization.envelope.actionDigest;
  const organizationId = authorization.actionCore.organizationId;
  const requiredExecutor = authorization.decision.requiredExecutor;
  if (
    requiredExecutor.adapterId !== compositionPolicy.agentBook.adapterId ||
    requiredExecutor.agentBookRegistry !==
      compositionPolicy.agentBook.registryId
  ) {
    return refusal('POLICY_ROUTE_MISMATCH');
  }

  const requestValidation = validateWorldProofOfHumanRequest(
    input.approval.request,
    deployment,
  );
  if (!requestValidation.ok) {
    return refusal('REQUEST_INVALID');
  }
  const request = requestValidation.request;
  const { binding } = request;
  if (
    binding.actionDigest !== actionDigest ||
    binding.organizationId !== organizationId ||
    !approvalRoleRequired(authorization, binding)
  ) {
    return refusal('POLICY_ROUTE_MISMATCH');
  }
  if (binding.decision !== 'APPROVE') {
    return refusal('NOT_AN_APPROVAL');
  }
  if (
    now < Date.parse(binding.createdAt) ||
    now >= Date.parse(binding.expiresAt) ||
    now < request.config.rp_context.created_at * 1_000 ||
    now >= request.config.rp_context.expires_at * 1_000
  ) {
    return refusal('VALIDITY_WINDOW_EMPTY');
  }

  const approvalClaim = exactClaim(
    input.approval.agentkitClaim,
    actionDigest,
    organizationId,
    now,
  );
  if (typeof approvalClaim === 'string') {
    return refusal(approvalClaim);
  }
  if (!sameAddress(approvalClaim.agentAddress, binding.agentAddress)) {
    return refusal('AGENTKIT_CLAIM_MISMATCH');
  }

  const requesterClaim = exactClaim(
    input.requester.agentkitClaim,
    actionDigest,
    organizationId,
    now,
  );
  if (typeof requesterClaim === 'string') {
    return refusal(requesterClaim);
  }

  const approvalBackingResult = await resolveBacking(
    approvalClaim,
    organizationId,
    now,
    keyring,
    compositionPolicy.agentBook,
    requiredExecutor.agentBookRegistry,
    'APPROVAL',
    dependencies.resolveAgentBookBacking,
  );
  if (!approvalBackingResult.ok) {
    return refusal(approvalBackingResult.reason);
  }
  const approvalBacking = approvalBackingResult.backing;
  if (
    !includesAlias(
      approvalBacking.aliases,
      binding.agentTenantPrincipal,
      binding.agentTenantPrincipalDerivationVersion,
    )
  ) {
    return refusal('AGENTBOOK_BACKING_MISMATCH');
  }

  const requesterBackingResult = await resolveBacking(
    requesterClaim,
    organizationId,
    now,
    keyring,
    compositionPolicy.agentBook,
    requiredExecutor.agentBookRegistry,
    'REQUESTER',
    dependencies.resolveAgentBookBacking,
  );
  if (!requesterBackingResult.ok) {
    return refusal(requesterBackingResult.reason);
  }
  const requesterBacking = requesterBackingResult.backing;
  const requesterPrincipal = currentAlias(requesterBacking.aliases);
  if (requesterPrincipal === null) {
    return refusal('AGENTBOOK_BACKING_INVALID');
  }

  const approvalAuthorityRequirement = Object.freeze({
    actionDigest,
    agentAddress: binding.agentAddress,
    agentTenantPrincipal: binding.agentTenantPrincipal,
    agentTenantPrincipalDerivationVersion:
      binding.agentTenantPrincipalDerivationVersion,
    at: verifiedAt,
    audience: null,
    grantDigest: null,
    grantId: binding.roleGrantId,
    grantVersion: null,
    kind: 'APPROVAL' as const,
    organizationId,
    requiredRole: binding.requiredRole,
    scope: null,
    subjectId: binding.subjectId,
  });
  const approvalAuthorityResult = await resolveAuthority(
    approvalAuthorityRequirement,
    now,
    dependencies.resolveCompanyAuthority,
  );
  if (!approvalAuthorityResult.ok) {
    return refusal(approvalAuthorityResult.reason);
  }
  const approvalAuthority = approvalAuthorityResult.authority;

  const requesterAuthorityRequirement = Object.freeze({
    actionDigest,
    agentAddress: requesterClaim.agentAddress,
    agentTenantPrincipal: requesterPrincipal.principal,
    agentTenantPrincipalDerivationVersion: requesterPrincipal.derivationVersion,
    at: verifiedAt,
    audience: requiredExecutor.audience,
    grantDigest: requiredExecutor.grant.digest,
    grantId: requiredExecutor.grant.id,
    grantVersion: requiredExecutor.grant.version,
    kind: 'REQUESTER' as const,
    organizationId,
    requiredRole: requiredExecutor.requiredRole,
    scope: requiredExecutor.requiredScope,
    subjectId: input.requester.agentId,
  });
  const requesterAuthorityResult = await resolveAuthority(
    requesterAuthorityRequirement,
    now,
    dependencies.resolveCompanyAuthority,
  );
  if (!requesterAuthorityResult.ok) {
    return refusal(requesterAuthorityResult.reason);
  }
  const requesterAuthority = requesterAuthorityResult.authority;

  const parsedProof = parseWorldProof(input.approval.proof, request);
  if (parsedProof === null) {
    return refusal('WORLD_PROOF_MISMATCH');
  }
  const proofExpiry = worldCredentialExpiry(parsedProof.response);
  if (proofExpiry === null || now >= Date.parse(proofExpiry)) {
    return refusal('WORLD_PROOF_STALE');
  }

  let proofVerification: unknown;
  try {
    proofVerification = await dependencies.verifyWorldProof(
      parsedProof.proof,
      deployment,
    );
  } catch {
    return refusal('WORLD_PROOF_UNAVAILABLE');
  }
  if (
    isRecord(proofVerification) &&
    proofVerification.status === 'unavailable'
  ) {
    return refusal('WORLD_PROOF_UNAVAILABLE');
  }
  if (
    !isRecord(proofVerification) ||
    proofVerification.status !== 'verified' ||
    Reflect.ownKeys(proofVerification).length !== 1
  ) {
    return refusal('WORLD_PROOF_INVALID');
  }

  let actionHumanAliases: readonly VersionedScopedWorldPrincipal[];
  try {
    actionHumanAliases = deriveActionHumanPrincipalAliases({
      actionDigest,
      keyring,
      nullifier: parsedProof.response.nullifier,
      organizationId,
      worldActionId: binding.worldActionId,
    });
  } catch {
    return refusal('WORLD_PROOF_INVALID');
  }
  const actionHumanPrincipal = currentAlias(actionHumanAliases);
  if (actionHumanPrincipal === null) {
    return refusal('WORLD_PROOF_INVALID');
  }

  const approvalExpiresAt = minimumExpiry([
    authorization.actionCore.expiresAt,
    binding.expiresAt,
    new Date(request.config.rp_context.expires_at * 1_000).toISOString(),
    approvalClaim.expiresAt,
    approvalBacking.resolution.expiresAt,
    approvalAuthority.expiresAt,
    proofExpiry,
  ]);
  const requesterExpiresAt = minimumExpiry([
    authorization.actionCore.expiresAt,
    requesterClaim.expiresAt,
    requesterBacking.resolution.expiresAt,
    requesterAuthority.expiresAt,
  ]);
  if (
    approvalExpiresAt === null ||
    requesterExpiresAt === null ||
    verifiedAt >= approvalExpiresAt ||
    verifiedAt >= requesterExpiresAt
  ) {
    return refusal('VALIDITY_WINDOW_EMPTY');
  }

  const proofDigest = hashRecord(
    'invoiceguard:world-idkit-proof:v1',
    parsedProof.proof,
  );
  const worldProofId = `world-proof:${proofDigest}`;
  const approvalEvidenceDigest = hashRecord(
    'invoiceguard:world-approval-evidence:v1',
    {
      agentBookEvidence: approvalBacking.evidence,
      agentkitSignedProofDigest: approvalClaim.signedProofDigest,
      companyCredentialDigest: approvalAuthority.credentialDigest,
      compositionPolicyId: compositionPolicy.policyId,
      proofDigest,
      worldDeploymentId: deployment.deploymentId,
    },
  );
  const approvalIdentity = {
    actionDigest,
    agentKitChallengeId: approvalClaim.challengeId,
    approvalSessionId: binding.approvalSessionId,
    compositionPolicyId: compositionPolicy.policyId,
    roleCredentialId: approvalAuthority.credentialId,
    subjectId: binding.subjectId,
    worldDeploymentId: deployment.deploymentId,
    worldProofId,
  };
  const approvalId = prefixedId(
    'world-approval',
    'invoiceguard:world-approval-id:v1',
    approvalIdentity,
  );
  const decisionId = prefixedId(
    'world-decision',
    'invoiceguard:world-decision-id:v1',
    approvalIdentity,
  );
  const consumptionClaimId = prefixedId(
    'world-consumption',
    'invoiceguard:world-consumption-claim:v1',
    {
      ...approvalIdentity,
      actionHumanPrincipal: actionHumanPrincipal.principal,
    },
  );

  const approvalFact = createAdapterVerifiedApprovalFact({
    ...actionFactBinding(authorization),
    actionHumanPrincipal: actionHumanPrincipal.principal,
    adapterId: WORLD_APPROVAL_ADAPTER_ID,
    agentBackingRecordId: approvalBacking.recordId,
    agentBackingStatus: 'CURRENT',
    agentKitChallengeId: approvalClaim.challengeId,
    agentTenantPrincipal: binding.agentTenantPrincipal,
    approvalId,
    approvalSessionId: binding.approvalSessionId,
    companyRoleStatus: 'CURRENT',
    consumptionClaimId,
    decision: 'APPROVE',
    decisionId,
    expiresAt: approvalExpiresAt,
    humanDecisionStatus: 'VERIFIED',
    kind: 'APPROVAL_FACT',
    role: binding.requiredRole,
    roleCredentialId: approvalAuthority.credentialId,
    signedProofDigest: approvalEvidenceDigest,
    subjectId: binding.subjectId,
    verifiedAt,
    worldProofId,
  });

  const requesterFactId = prefixedId(
    'world-requester',
    'invoiceguard:world-requester-fact:v1',
    {
      actionDigest,
      agentId: input.requester.agentId,
      agentBookEvidence: requesterBacking.evidence,
      agentKitChallengeId: requesterClaim.challengeId,
      compositionPolicyId: compositionPolicy.policyId,
      credentialDigest: requesterAuthority.credentialDigest,
      worldDeploymentId: deployment.deploymentId,
    },
  );
  const requesterFact = createRequestingAgentExecutionFact(authorization, {
    actionHumanPrincipal: requesterPrincipal.principal,
    adapterId: requesterBacking.evidence.adapterId,
    agentBackingRecordId: requesterBacking.recordId,
    agentBookRegistry: requesterBacking.evidence.registryId,
    agentBookStatus: 'CURRENT',
    agentId: input.requester.agentId,
    agentKitChallengeId: requesterClaim.challengeId,
    agentTenantPrincipal: requesterPrincipal.principal,
    audience: requiredExecutor.audience,
    companyRoleStatus: 'CURRENT',
    expiresAt: requesterExpiresAt,
    factId: requesterFactId,
    grantDigest: requiredExecutor.grant.digest,
    grantId: requiredExecutor.grant.id,
    grantStatus: 'CURRENT',
    grantVersion: requiredExecutor.grant.version,
    role: requiredExecutor.requiredRole,
    roleCredentialId: requesterAuthority.credentialId,
    scope: requiredExecutor.requiredScope,
    signedProofDigest: requesterClaim.signedProofDigest,
    subjectId: input.requester.agentId,
    tenantId: organizationId,
    verifiedAt,
  });

  const identityClaims: WorldAuthorityIdentityClaims = Object.freeze({
    actionDigest,
    approval: Object.freeze({
      actionHumanPrincipals: actionHumanAliases,
      agentKitChallengeId: approvalClaim.challengeId,
      agentTenantPrincipals: approvalBacking.aliases,
      approvalId,
      approvalSessionId: binding.approvalSessionId,
      consumptionClaimId,
      decisionId,
      subjectId: binding.subjectId,
      worldProofId,
    }),
    compositionPolicyId: compositionPolicy.policyId,
    organizationId,
    requester: Object.freeze({
      agentId: input.requester.agentId,
      agentKitChallengeId: requesterClaim.challengeId,
      agentTenantPrincipals: requesterBacking.aliases,
      factId: requesterFactId,
      subjectId: input.requester.agentId,
    }),
    worldDeploymentId: deployment.deploymentId,
  });

  const bundle = createVerifiedWorldAuthorityAdmissionBundle({
    agentBookEvidence: Object.freeze({
      approval: approvalBacking.evidence,
      requester: requesterBacking.evidence,
    }),
    approvalFact,
    compositionPolicyId: compositionPolicy.policyId,
    identityClaims,
    kind: 'WORLD_AUTHORITY_ADMISSION',
    requesterFact,
    schemaVersion: 1,
    verifiedAt,
    worldDeploymentId: deployment.deploymentId,
  });
  const admission = await dependencies.admissionWriter.admit(bundle);
  if (admission.status === 'unavailable') {
    return refusal('ADMISSION_UNAVAILABLE');
  }
  if (admission.status === 'rejected') {
    return refusal('ADMISSION_REJECTED');
  }
  return Object.freeze({ admission, ok: true });
}
