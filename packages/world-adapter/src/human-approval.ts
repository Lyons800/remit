import { createHash } from 'node:crypto';

import {
  hashSignal,
  proofOfHuman,
  type IDKitRequestConfig,
  type ProofOfHumanPreset,
  type RpContext,
} from '@worldcoin/idkit-core';
import { getAddress, isAddress } from 'viem';

import type {
  ScopedWorldPrincipal,
  WorldPrincipalDerivationVersion,
} from './privacy.js';

const ACTION_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const APP_ID_PATTERN = /^app_(?:staging_)?[A-Za-z0-9]{1,128}$/u;
const DERIVATION_VERSION_PATTERN = /^v[1-9][0-9]{0,8}$/u;
const RP_ID_PATTERN = /^rp_[A-Za-z0-9]{1,128}$/u;
const SCOPED_PRINCIPAL_PATTERN = /^hmac-sha256:[A-Za-z0-9_-]{43}$/u;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
const SUBJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAXIMUM_APPROVAL_SESSION_TTL_SECONDS = 300;

export type HumanApprovalDecision = 'APPROVE' | 'REJECT';
export type WorldProofEnvironment = 'production' | 'sandbox' | 'staging';
export type WorldDeploymentMode = 'live' | 'test';

export type TrustedWorldDeploymentContext = Readonly<{
  appId: `app_${string}`;
  environment: WorldProofEnvironment;
  mode: WorldDeploymentMode;
  rpId: `rp_${string}`;
}>;

export type TrustedWorldDeploymentContextValidationResult =
  | Readonly<{
      context: TrustedWorldDeploymentContext;
      ok: true;
    }>
  | Readonly<{
      ok: false;
    }>;

export type WorldHumanApprovalBinding = Readonly<{
  actionDigest: string;
  agentAddress: `0x${string}`;
  agentTenantPrincipal: ScopedWorldPrincipal;
  agentTenantPrincipalDerivationVersion: WorldPrincipalDerivationVersion;
  approvalSessionId: string;
  createdAt: string;
  decision: HumanApprovalDecision;
  expiresAt: string;
  organizationId: string;
  requiredRole: string;
  roleGrantId: string;
  subjectId: string;
  worldActionId: string;
  worldSignal: string;
}>;

export type WorldProofOfHumanRequest = Readonly<{
  binding: WorldHumanApprovalBinding;
  config: Readonly<IDKitRequestConfig>;
  environment: WorldProofEnvironment;
  expectedSignalHash: string;
  preset: Readonly<ProofOfHumanPreset>;
}>;

export type WorldProofOfHumanRequestValidationReason =
  | 'ACTION_MISMATCH'
  | 'ENVIRONMENT_MISMATCH'
  | 'REQUEST_INVALID'
  | 'RP_CONTEXT_INVALID'
  | 'SIGNAL_MISMATCH';

export type WorldProofOfHumanRequestValidationResult =
  | Readonly<{
      ok: true;
      request: WorldProofOfHumanRequest;
    }>
  | Readonly<{
      ok: false;
      reason: WorldProofOfHumanRequestValidationReason;
    }>;

type CreateWorldHumanApprovalBindingInput = Readonly<{
  actionDigest: string;
  agentAddress: string;
  agentTenantPrincipal: string;
  agentTenantPrincipalDerivationVersion: WorldPrincipalDerivationVersion;
  approvalSessionId: string;
  createdAt: Date;
  decision: HumanApprovalDecision;
  expiresAt: Date;
  organizationId: string;
  requiredRole: string;
  roleGrantId: string;
  subjectId: string;
}>;

type CreateWorldProofOfHumanRequestInput = Readonly<{
  appId: string;
  binding: WorldHumanApprovalBinding;
  environment?: WorldProofEnvironment;
  rpContext: RpContext;
}>;

type CreateTrustedWorldDeploymentContextInput = Readonly<{
  appId: string;
  environment: WorldProofEnvironment;
  mode: WorldDeploymentMode;
  rpId: string;
}>;

function requirePattern(value: string, pattern: RegExp, name: string): string {
  if (!pattern.test(value)) {
    throw new Error(`${name} has an invalid format.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(
  value: Record<string, unknown>,
  name: string,
): string | undefined {
  const field = value[name];
  return typeof field === 'string' ? field : undefined;
}

function cloneValue(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return undefined;
  }
}

function requireDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`${name} must be a valid date.`);
  }

  return value;
}

function requireAddress(value: string): `0x${string}` {
  if (!isAddress(value, { strict: false })) {
    throw new Error('agentAddress must be a valid EVM address.');
  }

  return getAddress(value);
}

function requirePrincipal(value: string): ScopedWorldPrincipal {
  if (!SCOPED_PRINCIPAL_PATTERN.test(value)) {
    throw new Error(
      'agentTenantPrincipal must be a scoped HMAC-SHA256 principal.',
    );
  }

  return value as ScopedWorldPrincipal;
}

function requireDecision(value: string): HumanApprovalDecision {
  if (value !== 'APPROVE' && value !== 'REJECT') {
    throw new Error('decision must be APPROVE or REJECT.');
  }

  return value;
}

function requireEnvironment(value: string): WorldProofEnvironment {
  if (value !== 'production' && value !== 'sandbox' && value !== 'staging') {
    throw new Error('environment is not supported by World IDKit.');
  }

  return value;
}

function requireDeploymentMode(value: string): WorldDeploymentMode {
  if (value !== 'live' && value !== 'test') {
    throw new Error('World deployment mode must be live or test.');
  }

  return value;
}

export function createTrustedWorldDeploymentContext({
  appId: rawAppId,
  environment: rawEnvironment,
  mode: rawMode,
  rpId: rawRpId,
}: CreateTrustedWorldDeploymentContextInput): TrustedWorldDeploymentContext {
  const appId = requirePattern(rawAppId, APP_ID_PATTERN, 'appId');
  const environment = requireEnvironment(rawEnvironment);
  const mode = requireDeploymentMode(rawMode);
  const rpId = requirePattern(rawRpId, RP_ID_PATTERN, 'rpId');

  if (mode === 'live' && environment !== 'production') {
    throw new Error('Live World deployments must use production.');
  }

  if (mode === 'live' && appId.startsWith('app_staging_')) {
    throw new Error('Live World deployments cannot use a staging app ID.');
  }

  return Object.freeze({
    appId: appId as `app_${string}`,
    environment,
    mode,
    rpId: rpId as `rp_${string}`,
  });
}

export function validateTrustedWorldDeploymentContext(
  value: unknown,
): TrustedWorldDeploymentContextValidationResult {
  const snapshot = cloneValue(value);

  if (!isRecord(snapshot)) {
    return Object.freeze({ ok: false });
  }

  const appId = stringField(snapshot, 'appId');
  const environment = stringField(snapshot, 'environment');
  const mode = stringField(snapshot, 'mode');
  const rpId = stringField(snapshot, 'rpId');

  if (
    appId === undefined ||
    environment === undefined ||
    mode === undefined ||
    rpId === undefined
  ) {
    return Object.freeze({ ok: false });
  }

  try {
    return Object.freeze({
      context: createTrustedWorldDeploymentContext({
        appId,
        environment: requireEnvironment(environment),
        mode: requireDeploymentMode(mode),
        rpId,
      }),
      ok: true,
    });
  } catch {
    return Object.freeze({ ok: false });
  }
}

function hashBinding(domain: string, fields: readonly string[]): string {
  const hash = createHash('sha256');

  for (const field of [domain, ...fields]) {
    hash.update(String(Buffer.byteLength(field, 'utf8')));
    hash.update(':');
    hash.update(field, 'utf8');
  }

  return hash.digest('hex');
}

function deriveWorldActionId(
  input: Pick<WorldHumanApprovalBinding, 'actionDigest' | 'organizationId'>,
): string {
  const digest = hashBinding('invoiceguard:world-action:v1', [
    input.organizationId,
    input.actionDigest,
  ]);

  return `invoiceguard-approval-v1-${digest}`;
}

function deriveWorldSignal(
  input: Omit<WorldHumanApprovalBinding, 'worldActionId' | 'worldSignal'>,
): string {
  const digest = hashBinding('invoiceguard:world-signal:v1', [
    input.organizationId,
    input.actionDigest,
    input.approvalSessionId,
    input.subjectId,
    input.roleGrantId,
    input.requiredRole,
    input.agentAddress,
    input.agentTenantPrincipal,
    input.agentTenantPrincipalDerivationVersion,
    input.decision,
    input.expiresAt,
  ]);

  return `invoiceguard-signal-v1-${digest}`;
}

export function createWorldHumanApprovalBinding({
  actionDigest: rawActionDigest,
  agentAddress: rawAgentAddress,
  agentTenantPrincipal: rawAgentTenantPrincipal,
  agentTenantPrincipalDerivationVersion,
  approvalSessionId: rawApprovalSessionId,
  createdAt: rawCreatedAt,
  decision,
  expiresAt: rawExpiresAt,
  organizationId: rawOrganizationId,
  requiredRole: rawRequiredRole,
  roleGrantId: rawRoleGrantId,
  subjectId: rawSubjectId,
}: CreateWorldHumanApprovalBindingInput): WorldHumanApprovalBinding {
  const actionDigest = requirePattern(
    rawActionDigest,
    ACTION_DIGEST_PATTERN,
    'actionDigest',
  );
  const agentAddress = requireAddress(rawAgentAddress);
  const agentTenantPrincipal = requirePrincipal(rawAgentTenantPrincipal);
  const approvalSessionId = requirePattern(
    rawApprovalSessionId,
    SESSION_ID_PATTERN,
    'approvalSessionId',
  );
  const createdAt = requireDate(rawCreatedAt, 'createdAt');
  const validatedDecision = requireDecision(decision);
  const expiresAt = requireDate(rawExpiresAt, 'expiresAt');
  const organizationId = requirePattern(
    rawOrganizationId,
    TOKEN_PATTERN,
    'organizationId',
  );
  const requiredRole = requirePattern(
    rawRequiredRole,
    TOKEN_PATTERN,
    'requiredRole',
  );
  const roleGrantId = requirePattern(
    rawRoleGrantId,
    TOKEN_PATTERN,
    'roleGrantId',
  );
  const subjectId = requirePattern(
    rawSubjectId,
    SUBJECT_ID_PATTERN,
    'subjectId',
  );
  const ttlMilliseconds = expiresAt.getTime() - createdAt.getTime();

  if (
    ttlMilliseconds <= 0 ||
    ttlMilliseconds > MAXIMUM_APPROVAL_SESSION_TTL_SECONDS * 1_000
  ) {
    throw new Error(
      'approval session lifetime must be greater than zero and at most 300 seconds.',
    );
  }

  const unbound = Object.freeze({
    actionDigest,
    agentAddress,
    agentTenantPrincipal,
    agentTenantPrincipalDerivationVersion,
    approvalSessionId,
    createdAt: createdAt.toISOString(),
    decision: validatedDecision,
    expiresAt: expiresAt.toISOString(),
    organizationId,
    requiredRole,
    roleGrantId,
    subjectId,
  });
  const worldActionId = deriveWorldActionId(unbound);
  const worldSignal = deriveWorldSignal(unbound);

  return Object.freeze({
    ...unbound,
    worldActionId,
    worldSignal,
  });
}

function requireRpContext(
  value: RpContext,
  binding: WorldHumanApprovalBinding,
): Readonly<RpContext> {
  requirePattern(value.rp_id, RP_ID_PATTERN, 'rpContext.rp_id');

  if (
    value.nonce.length === 0 ||
    value.signature.length === 0 ||
    !Number.isInteger(value.created_at) ||
    !Number.isInteger(value.expires_at) ||
    value.expires_at <= value.created_at ||
    value.expires_at * 1_000 > Date.parse(binding.expiresAt)
  ) {
    throw new Error(
      'rpContext must be signed, finite, and expire no later than the approval session.',
    );
  }

  return Object.freeze({ ...value });
}

function invalidRequest(
  reason: WorldProofOfHumanRequestValidationReason,
): WorldProofOfHumanRequestValidationResult {
  return Object.freeze({ ok: false, reason });
}

export function validateWorldProofOfHumanRequest(
  value: unknown,
): WorldProofOfHumanRequestValidationResult {
  const snapshot = cloneValue(value);

  if (!isRecord(snapshot)) {
    return invalidRequest('REQUEST_INVALID');
  }

  const rawBinding = snapshot.binding;
  const rawConfig = snapshot.config;
  const rawPreset = snapshot.preset;

  if (
    !isRecord(rawBinding) ||
    !isRecord(rawConfig) ||
    !isRecord(rawConfig.rp_context) ||
    !isRecord(rawPreset)
  ) {
    return invalidRequest('REQUEST_INVALID');
  }

  const actionDigest = stringField(rawBinding, 'actionDigest');
  const agentAddress = stringField(rawBinding, 'agentAddress');
  const agentTenantPrincipal = stringField(rawBinding, 'agentTenantPrincipal');
  const agentTenantPrincipalDerivationVersion = stringField(
    rawBinding,
    'agentTenantPrincipalDerivationVersion',
  );
  const approvalSessionId = stringField(rawBinding, 'approvalSessionId');
  const createdAt = stringField(rawBinding, 'createdAt');
  const decision = stringField(rawBinding, 'decision');
  const expiresAt = stringField(rawBinding, 'expiresAt');
  const organizationId = stringField(rawBinding, 'organizationId');
  const requiredRole = stringField(rawBinding, 'requiredRole');
  const roleGrantId = stringField(rawBinding, 'roleGrantId');
  const subjectId = stringField(rawBinding, 'subjectId');
  const worldActionId = stringField(rawBinding, 'worldActionId');
  const worldSignal = stringField(rawBinding, 'worldSignal');

  if (
    actionDigest === undefined ||
    agentAddress === undefined ||
    agentTenantPrincipal === undefined ||
    agentTenantPrincipalDerivationVersion === undefined ||
    approvalSessionId === undefined ||
    createdAt === undefined ||
    decision === undefined ||
    expiresAt === undefined ||
    organizationId === undefined ||
    requiredRole === undefined ||
    roleGrantId === undefined ||
    subjectId === undefined ||
    worldActionId === undefined ||
    worldSignal === undefined
  ) {
    return invalidRequest('REQUEST_INVALID');
  }

  let exactBinding: WorldHumanApprovalBinding;

  try {
    exactBinding = createWorldHumanApprovalBinding({
      actionDigest,
      agentAddress,
      agentTenantPrincipal,
      agentTenantPrincipalDerivationVersion: requirePattern(
        agentTenantPrincipalDerivationVersion,
        DERIVATION_VERSION_PATTERN,
        'agentTenantPrincipalDerivationVersion',
      ) as WorldPrincipalDerivationVersion,
      approvalSessionId,
      createdAt: new Date(createdAt),
      decision: requireDecision(decision),
      expiresAt: new Date(expiresAt),
      organizationId,
      requiredRole,
      roleGrantId,
      subjectId,
    });
  } catch {
    return invalidRequest('REQUEST_INVALID');
  }

  if (exactBinding.worldActionId !== worldActionId) {
    return invalidRequest('ACTION_MISMATCH');
  }

  if (exactBinding.worldSignal !== worldSignal) {
    return invalidRequest('SIGNAL_MISMATCH');
  }

  if (
    exactBinding.agentAddress !== agentAddress ||
    exactBinding.agentTenantPrincipal !== agentTenantPrincipal ||
    exactBinding.agentTenantPrincipalDerivationVersion !==
      agentTenantPrincipalDerivationVersion ||
    exactBinding.createdAt !== createdAt ||
    exactBinding.expiresAt !== expiresAt
  ) {
    return invalidRequest('REQUEST_INVALID');
  }

  const configAction = stringField(rawConfig, 'action');
  const appId = stringField(rawConfig, 'app_id');
  const configEnvironment = stringField(rawConfig, 'environment');
  const requestEnvironment = stringField(snapshot, 'environment');

  if (configAction !== exactBinding.worldActionId) {
    return invalidRequest('ACTION_MISMATCH');
  }

  if (
    configEnvironment === undefined ||
    requestEnvironment === undefined ||
    configEnvironment !== requestEnvironment
  ) {
    return invalidRequest('ENVIRONMENT_MISMATCH');
  }

  let environment: WorldProofEnvironment;

  try {
    environment = requireEnvironment(configEnvironment);

    if (appId === undefined) {
      return invalidRequest('REQUEST_INVALID');
    }

    requirePattern(appId, APP_ID_PATTERN, 'appId');
  } catch {
    return invalidRequest('REQUEST_INVALID');
  }

  if (
    rawConfig.allow_legacy_proofs !== false ||
    rawConfig.require_user_presence !== true
  ) {
    return invalidRequest('REQUEST_INVALID');
  }

  const rawRpContext = rawConfig.rp_context;
  const rpId = stringField(rawRpContext, 'rp_id');
  const nonce = stringField(rawRpContext, 'nonce');
  const signature = stringField(rawRpContext, 'signature');

  if (
    rpId === undefined ||
    nonce === undefined ||
    signature === undefined ||
    typeof rawRpContext.created_at !== 'number' ||
    typeof rawRpContext.expires_at !== 'number'
  ) {
    return invalidRequest('RP_CONTEXT_INVALID');
  }

  let rpContext: Readonly<RpContext>;

  try {
    rpContext = requireRpContext(
      {
        created_at: rawRpContext.created_at,
        expires_at: rawRpContext.expires_at,
        nonce,
        rp_id: rpId,
        signature,
      },
      exactBinding,
    );
  } catch {
    return invalidRequest('RP_CONTEXT_INVALID');
  }

  const presetType = stringField(rawPreset, 'type');
  const presetSignal = stringField(rawPreset, 'signal');
  const expectedSignalHash = stringField(snapshot, 'expectedSignalHash');

  if (
    presetType !== 'ProofOfHuman' ||
    presetSignal !== exactBinding.worldSignal ||
    expectedSignalHash !== hashSignal(exactBinding.worldSignal)
  ) {
    return invalidRequest('SIGNAL_MISMATCH');
  }

  const request = Object.freeze({
    binding: exactBinding,
    config: Object.freeze({
      action: exactBinding.worldActionId,
      allow_legacy_proofs: false,
      app_id: appId as `app_${string}`,
      environment,
      require_user_presence: true,
      rp_context: rpContext,
    } satisfies IDKitRequestConfig),
    environment,
    expectedSignalHash,
    preset: Object.freeze({
      signal: exactBinding.worldSignal,
      type: 'ProofOfHuman' as const,
    }),
  });

  return Object.freeze({ ok: true, request });
}

export function createWorldProofOfHumanRequest({
  appId: rawAppId,
  binding,
  environment = 'production',
  rpContext: rawRpContext,
}: CreateWorldProofOfHumanRequestInput): WorldProofOfHumanRequest {
  const appId = requirePattern(rawAppId, APP_ID_PATTERN, 'appId');
  const expectedWorldActionId = deriveWorldActionId(binding);
  const expectedWorldSignal = deriveWorldSignal(binding);

  if (
    binding.worldActionId !== expectedWorldActionId ||
    binding.worldSignal !== expectedWorldSignal
  ) {
    throw new Error('binding does not match its exact action semantics.');
  }

  const rpContext = requireRpContext(rawRpContext, binding);
  const validatedEnvironment = requireEnvironment(environment);
  const preset = Object.freeze(proofOfHuman({ signal: binding.worldSignal }));
  const config = Object.freeze({
    action: binding.worldActionId,
    allow_legacy_proofs: false,
    app_id: appId as `app_${string}`,
    environment: validatedEnvironment,
    require_user_presence: true,
    rp_context: rpContext,
  } satisfies IDKitRequestConfig);

  const candidate = Object.freeze({
    binding,
    config,
    environment: validatedEnvironment,
    expectedSignalHash: hashSignal(binding.worldSignal),
    preset,
  });
  const validated = validateWorldProofOfHumanRequest(candidate);

  if (!validated.ok) {
    throw new Error(
      `World proof request construction failed: ${validated.reason}.`,
    );
  }

  return validated.request;
}
