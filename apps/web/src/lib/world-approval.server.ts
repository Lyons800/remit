import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  createTrustedWorldDeploymentContext,
  createWorldHumanApprovalBinding,
  createWorldPrincipalKeyring,
  createWorldProofOfHumanRequest,
  deriveAgentTenantPrincipal,
  signApprovalRequest,
} from '@remit/world-adapter';

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
  /** What a returned proof's signal must hash to. Checked on the way back. */
  readonly expectedSignalHash: string;
  readonly worldActionId: string;
  readonly approvalSessionId: string;
  readonly expiresAt: string;
}

/** Sessions are short-lived by design; an approval left open is an approval. */
const APPROVAL_TTL_MS = 5 * 60_000;

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

  return {
    approvalSessionId: binding.approvalSessionId,
    config: request.config,
    expectedSignalHash: request.expectedSignalHash,
    expiresAt: binding.expiresAt,
    worldActionId: binding.worldActionId,
  };
}
