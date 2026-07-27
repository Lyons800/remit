import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  createTrustedWorldDeploymentContext,
  createWorldHumanApprovalBinding,
  createWorldProofOfHumanRequest,
  signApprovalRequest,
  validateWorldProofOfHumanResult,
  type WorldProofOfHumanRequest,
} from '@remit/world-adapter/human-approval';
import {
  createWorldPrincipalKeyring,
  deriveActionHumanPrincipal,
  deriveAgentTenantPrincipal,
} from '@remit/world-adapter/privacy';

/**
 * Mint a World App approval request for one exact payment.
 *
 * The relying-party signing key lives here and only here. World is explicit
 * that a leaked RP key lets anyone forge requests as this app, so the browser
 * receives the finished request and never the material used to sign it.
 *
 * The important property is the binding: the action digest travels into the
 * proof as the World ID signal, so a proof returned for this invoice cannot be
 * replayed against another. Lift it and validation fails SIGNAL_MISMATCH.
 *
 * The action id is derived per payment rather than being one shared
 * "approve-payment" action, which means World itself enforces one approval per
 * human per invoice. Nothing in our database is trusted for that.
 */

export interface ApprovalRequestInput {
  readonly actionDigest: string;
  readonly agentAddress: `0x${string}`;
  readonly humanId: string;
  readonly organizationId: string;
  readonly requiredRole: string;
  readonly roleGrantId: string;
  readonly subjectId: string;
}

export interface MintedApprovalRequest {
  /** Handed to IDKit in the browser. Contains no secret material. */
  readonly config: unknown;
  /** Exact action-bound credential preset created by the trusted adapter. */
  readonly preset: unknown;
  /** What a returned proof's signal must hash to. Checked on the way back. */
  readonly expectedSignalHash: string;
  readonly worldActionId: string;
  readonly approvalSessionId: string;
  readonly expiresAt: string;
}

/** Sessions are short-lived; an open request never counts as an approval. */
const APPROVAL_TTL_MS = 5 * 60_000;
const WORLD_VERIFY_TIMEOUT_MS = 12_000;
const MAXIMUM_PENDING_APPROVALS = 64;

type ApprovalStatus =
  | 'executed'
  | 'failed'
  | 'pending'
  | 'verified'
  | 'verifying';

interface PendingWorldApproval {
  readonly actionDigest: string;
  readonly organizationId: string;
  readonly request: WorldProofOfHumanRequest;
  status: ApprovalStatus;
}

interface WorldApprovalStore {
  readonly pending: Map<string, PendingWorldApproval>;
  readonly usedActionHumans: Map<string, number>;
}

type WorldApprovalGlobal = typeof globalThis & {
  __remitWorldApprovalStore?: WorldApprovalStore;
};

export type WorldApprovalVerificationResult =
  | Readonly<{
      ok: true;
      actionDigest: string;
      approvalSessionId: string;
      verifiedAt: string;
    }>
  | Readonly<{
      ok: false;
      reason:
        | 'PROOF_MISMATCH'
        | 'PROOF_REPLAYED'
        | 'SESSION_EXPIRED'
        | 'SESSION_NOT_FOUND'
        | 'SESSION_REPLAYED'
        | 'WORLD_REJECTED'
        | 'WORLD_UNAVAILABLE';
    }>;

function approvalStore(): WorldApprovalStore {
  const shared = globalThis as WorldApprovalGlobal;
  shared.__remitWorldApprovalStore ??= {
    pending: new Map(),
    usedActionHumans: new Map(),
  };
  return shared.__remitWorldApprovalStore;
}

function purgeExpiredApprovals(now: number): void {
  const store = approvalStore();
  for (const [sessionId, approval] of store.pending) {
    if (Date.parse(approval.request.binding.expiresAt) <= now) {
      store.pending.delete(sessionId);
    }
  }
  for (const [principal, expiresAt] of store.usedActionHumans) {
    if (expiresAt <= now) store.usedActionHumans.delete(principal);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRetryableWorldStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function portalVerified(
  value: unknown,
  request: WorldProofOfHumanRequest,
  nullifier: string,
): boolean {
  if (
    !isRecord(value) ||
    value.success !== true ||
    (value.action !== undefined &&
      value.action !== request.binding.worldActionId) ||
    (value.environment !== undefined &&
      value.environment !== request.environment) ||
    !Array.isArray(value.results)
  ) {
    return false;
  }

  return value.results.some(
    (result) =>
      isRecord(result) &&
      (result.identifier === 'proof_of_human' ||
        result.identifier === 'orb') &&
      result.success === true &&
      typeof result.nullifier === 'string' &&
      result.nullifier.toLowerCase() === nullifier.toLowerCase(),
  );
}

function need(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`${key} is not configured`);
  }
  return value;
}

export function isWorldApprovalConfigured(): boolean {
  return [
    'WORLD_APP_ID',
    'WORLD_RP_ID',
    'RP_SIGNING_KEY',
    'WORLD_PRINCIPAL_HMAC_KEY',
  ]
    .map((key) => process.env[key])
    .every((value) => value !== undefined && value !== '');
}

export function mintApprovalRequest(
  input: ApprovalRequestInput,
): MintedApprovalRequest {
  const deployment = createTrustedWorldDeploymentContext({
    appId: need('WORLD_APP_ID'),
    environment: 'production',
    mode: 'live',
    rpId: need('WORLD_RP_ID'),
  });

  // Tenant-scoped so two organisations cannot correlate the same agent.
  const keyring = createWorldPrincipalKeyring({
    key: Buffer.from(need('WORLD_PRINCIPAL_HMAC_KEY'), 'hex'),
    version: 'v1',
  });
  const agentTenantPrincipal = deriveAgentTenantPrincipal({
    humanId: input.humanId,
    key: keyring.current.key,
    organizationId: input.organizationId,
  });

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + APPROVAL_TTL_MS);

  const binding = createWorldHumanApprovalBinding({
    actionDigest: input.actionDigest,
    agentAddress: input.agentAddress,
    agentTenantPrincipal,
    agentTenantPrincipalDerivationVersion: keyring.current.version,
    approvalSessionId: `approval-${randomUUID()}`,
    createdAt,
    decision: 'APPROVE',
    expiresAt,
    organizationId: input.organizationId,
    requiredRole: input.requiredRole,
    roleGrantId: input.roleGrantId,
    subjectId: input.subjectId,
  });

  // Signed locally — no round trip to World, so opening an approval cannot
  // fail on their availability.
  const signed = signApprovalRequest({
    action: binding.worldActionId,
    signingKeyHex: need('RP_SIGNING_KEY'),
  });

  const request = createWorldProofOfHumanRequest({
    binding,
    deployment,
    rpContext: {
      created_at: signed.createdAt,
      expires_at: signed.expiresAt,
      nonce: signed.nonce,
      rp_id: deployment.rpId,
      signature: signed.sig,
    },
  });

  const store = approvalStore();
  purgeExpiredApprovals(Date.now());
  if (store.pending.size >= MAXIMUM_PENDING_APPROVALS) {
    throw new Error('Too many World approval sessions are already open.');
  }
  store.pending.set(binding.approvalSessionId, {
    actionDigest: binding.actionDigest,
    organizationId: binding.organizationId,
    request,
    status: 'pending',
  });

  return {
    approvalSessionId: binding.approvalSessionId,
    config: request.config,
    expectedSignalHash: request.expectedSignalHash,
    expiresAt: binding.expiresAt,
    preset: request.preset,
    worldActionId: binding.worldActionId,
  };
}

/**
 * Verify one completed IDKit result with World and consume its local demo
 * session.
 *
 * This proves the phone returned a valid proof for the exact World action and
 * signal. The in-memory store prevents replay inside one dev process, but it is
 * deliberately not presented as durable payment authority: production still
 * requires the serializable repository admission described in WORLD.md.
 */
export async function verifyWorldApprovalProof(input: {
  readonly approvalSessionId: string;
  readonly organizationId: string;
  readonly proof: unknown;
  readonly fetcher?: typeof fetch;
  readonly now?: Date;
}): Promise<WorldApprovalVerificationResult> {
  const now = input.now ?? new Date();
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) {
    return { ok: false, reason: 'PROOF_MISMATCH' };
  }

  const store = approvalStore();
  const pending = store.pending.get(input.approvalSessionId);
  if (
    pending === undefined ||
    pending.organizationId !== input.organizationId
  ) {
    return { ok: false, reason: 'SESSION_NOT_FOUND' };
  }
  if (nowMilliseconds >= Date.parse(pending.request.binding.expiresAt)) {
    store.pending.delete(input.approvalSessionId);
    purgeExpiredApprovals(nowMilliseconds);
    return { ok: false, reason: 'SESSION_EXPIRED' };
  }
  if (pending.status !== 'pending') {
    return { ok: false, reason: 'SESSION_REPLAYED' };
  }

  const validated = validateWorldProofOfHumanResult(
    input.proof,
    pending.request,
  );
  if (!validated.ok) {
    pending.status = 'failed';
    return { ok: false, reason: 'PROOF_MISMATCH' };
  }

  pending.status = 'verifying';
  const fetcher = input.fetcher ?? fetch;
  let portalResponse: Response;
  try {
    portalResponse = await fetcher(
      `https://developer.world.org/api/v4/verify/${encodeURIComponent(
        pending.request.config.rp_context.rp_id,
      )}`,
      {
        body: JSON.stringify(validated.proof),
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(WORLD_VERIFY_TIMEOUT_MS),
      },
    );
  } catch {
    pending.status = 'pending';
    return { ok: false, reason: 'WORLD_UNAVAILABLE' };
  }

  let portalResult: unknown;
  try {
    portalResult = await portalResponse.json();
  } catch {
    const retryable = isRetryableWorldStatus(portalResponse.status);
    pending.status = retryable ? 'pending' : 'failed';
    return {
      ok: false,
      reason: retryable ? 'WORLD_UNAVAILABLE' : 'WORLD_REJECTED',
    };
  }

  if (
    !portalResponse.ok ||
    !portalVerified(portalResult, pending.request, validated.response.nullifier)
  ) {
    const retryable = isRetryableWorldStatus(portalResponse.status);
    pending.status = retryable ? 'pending' : 'failed';
    return {
      ok: false,
      reason: retryable ? 'WORLD_UNAVAILABLE' : 'WORLD_REJECTED',
    };
  }

  const principalKey = Buffer.from(need('WORLD_PRINCIPAL_HMAC_KEY'), 'hex');
  const actionHumanPrincipal = deriveActionHumanPrincipal({
    actionDigest: pending.actionDigest,
    key: principalKey,
    nullifier: validated.response.nullifier,
    organizationId: pending.organizationId,
    worldActionId: pending.request.binding.worldActionId,
  });
  if (store.usedActionHumans.has(actionHumanPrincipal)) {
    pending.status = 'failed';
    return { ok: false, reason: 'PROOF_REPLAYED' };
  }

  pending.status = 'verified';
  store.usedActionHumans.set(
    actionHumanPrincipal,
    Date.parse(pending.request.binding.expiresAt),
  );

  return Object.freeze({
    actionDigest: pending.actionDigest,
    approvalSessionId: input.approvalSessionId,
    ok: true,
    verifiedAt: now.toISOString(),
  });
}

export type ApprovalConsumptionResult =
  | Readonly<{ ok: true; actionDigest: string }>
  | Readonly<{
      ok: false;
      reason: 'ALREADY_EXECUTED' | 'DIGEST_MISMATCH' | 'NOT_VERIFIED';
    }>;

/**
 * Consume a verified approval so it can authorize exactly one execution.
 *
 * The status flips to 'executed' before any payment is submitted, so a
 * concurrent second call refuses rather than double-paying. Like the rest of
 * this store, consumption is in-memory demo state, not durable authority.
 */
export function consumeVerifiedApproval(input: {
  readonly approvalSessionId: string;
  readonly actionDigest: string;
}): ApprovalConsumptionResult {
  const pending = approvalStore().pending.get(input.approvalSessionId);
  if (pending === undefined || pending.status === 'failed') {
    return { ok: false, reason: 'NOT_VERIFIED' };
  }
  if (pending.status === 'executed') {
    return { ok: false, reason: 'ALREADY_EXECUTED' };
  }
  if (pending.status !== 'verified') {
    return { ok: false, reason: 'NOT_VERIFIED' };
  }
  if (pending.actionDigest !== input.actionDigest) {
    return { ok: false, reason: 'DIGEST_MISMATCH' };
  }
  pending.status = 'executed';
  return { ok: true, actionDigest: pending.actionDigest };
}
