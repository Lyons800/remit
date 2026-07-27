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
import {
  postgresWorldApprovalStore,
  type WorldApprovalSessionStore,
} from './world-approval-store.server';
import { db } from './workspace.server';

function defaultStore(): WorldApprovalSessionStore {
  return postgresWorldApprovalStore(db());
}

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

export async function mintApprovalRequest(
  input: ApprovalRequestInput,
  store: WorldApprovalSessionStore = defaultStore(),
): Promise<MintedApprovalRequest> {
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

  await store.purgeExpired(createdAt);
  const open = await store.countOpen(binding.organizationId, createdAt);
  if (open >= MAXIMUM_PENDING_APPROVALS) {
    throw new Error('Too many World approval sessions are already open.');
  }
  await store.insert({
    actionDigest: binding.actionDigest,
    approvalSessionId: binding.approvalSessionId,
    expiresAt,
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
 * Verify one completed IDKit result with World and mark its durable session.
 *
 * The session is atomically claimed (pending → verifying) before any external
 * call, so concurrent verifications of one session race for a single claim
 * and the loser refuses. A World outage releases the claim (verifying →
 * pending) so retrying is safe; every other outcome is terminal.
 */
export async function verifyWorldApprovalProof(input: {
  readonly approvalSessionId: string;
  readonly organizationId: string;
  readonly proof: unknown;
  readonly fetcher?: typeof fetch;
  readonly now?: Date;
  readonly store?: WorldApprovalSessionStore;
}): Promise<WorldApprovalVerificationResult> {
  const now = input.now ?? new Date();
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) {
    return { ok: false, reason: 'PROOF_MISMATCH' };
  }

  const store = input.store ?? defaultStore();
  const session = await store.get(input.approvalSessionId);
  if (
    session === undefined ||
    session.organizationId !== input.organizationId
  ) {
    return { ok: false, reason: 'SESSION_NOT_FOUND' };
  }
  if (nowMilliseconds >= session.expiresAt.getTime()) {
    return { ok: false, reason: 'SESSION_EXPIRED' };
  }
  const request = session.request as WorldProofOfHumanRequest;

  const claimed = await store.transition(
    session.approvalSessionId,
    ['pending'],
    'verifying',
  );
  if (!claimed) {
    return { ok: false, reason: 'SESSION_REPLAYED' };
  }
  const settle = async (to: 'failed' | 'pending' | 'verified') => {
    await store.transition(session.approvalSessionId, ['verifying'], to);
  };

  const validated = validateWorldProofOfHumanResult(input.proof, request);
  if (!validated.ok) {
    await settle('failed');
    return { ok: false, reason: 'PROOF_MISMATCH' };
  }

  const fetcher = input.fetcher ?? fetch;
  let portalResponse: Response;
  try {
    portalResponse = await fetcher(
      `https://developer.world.org/api/v4/verify/${encodeURIComponent(
        request.config.rp_context.rp_id,
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
    await settle('pending');
    return { ok: false, reason: 'WORLD_UNAVAILABLE' };
  }

  let portalResult: unknown;
  try {
    portalResult = await portalResponse.json();
  } catch {
    const retryable = isRetryableWorldStatus(portalResponse.status);
    await settle(retryable ? 'pending' : 'failed');
    return {
      ok: false,
      reason: retryable ? 'WORLD_UNAVAILABLE' : 'WORLD_REJECTED',
    };
  }

  if (
    !portalResponse.ok ||
    !portalVerified(portalResult, request, validated.response.nullifier)
  ) {
    const retryable = isRetryableWorldStatus(portalResponse.status);
    await settle(retryable ? 'pending' : 'failed');
    return {
      ok: false,
      reason: retryable ? 'WORLD_UNAVAILABLE' : 'WORLD_REJECTED',
    };
  }

  const principalKey = Buffer.from(need('WORLD_PRINCIPAL_HMAC_KEY'), 'hex');
  const actionHumanPrincipal = deriveActionHumanPrincipal({
    actionDigest: session.actionDigest,
    key: principalKey,
    nullifier: validated.response.nullifier,
    organizationId: session.organizationId,
    worldActionId: request.binding.worldActionId,
  });
  const claimedHuman = await store.claimActionHuman(
    actionHumanPrincipal,
    session.expiresAt,
  );
  if (!claimedHuman) {
    await settle('failed');
    return { ok: false, reason: 'PROOF_REPLAYED' };
  }

  await settle('verified');

  return Object.freeze({
    actionDigest: session.actionDigest,
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
 * The verified → executed transition is a single conditional UPDATE, so of any
 * number of concurrent callers exactly one proceeds and the rest refuse. The
 * flip happens before any payment is submitted; losing the race can never
 * double-pay.
 */
export async function consumeVerifiedApproval(input: {
  readonly approvalSessionId: string;
  readonly actionDigest: string;
  readonly store?: WorldApprovalSessionStore;
}): Promise<ApprovalConsumptionResult> {
  const store = input.store ?? defaultStore();
  const session = await store.get(input.approvalSessionId);
  if (session === undefined) {
    return { ok: false, reason: 'NOT_VERIFIED' };
  }
  if (session.actionDigest !== input.actionDigest) {
    return { ok: false, reason: 'DIGEST_MISMATCH' };
  }
  if (session.status === 'executed') {
    return { ok: false, reason: 'ALREADY_EXECUTED' };
  }
  const consumed = await store.transition(
    session.approvalSessionId,
    ['verified'],
    'executed',
  );
  if (!consumed) {
    // Either it was never verified, or a concurrent caller consumed it first.
    return {
      ok: false,
      reason: session.status === 'verified' ? 'ALREADY_EXECUTED' : 'NOT_VERIFIED',
    };
  }
  return { ok: true, actionDigest: session.actionDigest };
}
