import { createHash, verify, type KeyObject } from 'node:crypto';

import {
  createAdapterVerifiedEvidenceResult,
  createAdapterVerifiedVerificationPayment,
  parseAdapterVerifiedVerificationPayment,
  type AdapterVerifiedEvidenceResult,
  type AdapterVerifiedVerificationPayment,
  type VerificationQuoteRequestEffect,
} from '@invoiceguard/domain';
import {
  canonicalizeJson,
  hashCanonicalInvoice,
  verifyAuthorizationBundle,
  verifySupplierMasterSnapshot,
  type AuthorizationBundleV1,
  type CanonicalJsonValue,
} from '@invoiceguard/protocol/hashing';
import type {
  BeneficiaryV1,
  CanonicalInvoiceV1,
  SupplierMasterSnapshotV1,
} from '@invoiceguard/protocol';
import type { PaymentRequirements } from '@x402/core/types';

import {
  parseCanonicalEntityId,
  parseCanonicalTransactionId,
} from './hedera-sdk-runtime.js';

export const HEDERA_TESTNET_CAIP2 = 'hedera:296';
export const HEDERA_X402_TESTNET_NETWORK = 'hedera:testnet';
export const HBAR_ASSET_ID = '0.0.0';
export const SUPPLIER_EVIDENCE_ROUTE_PREFIX = '/v2/supplier-evidence-checks/';
export const SUPPLIER_EVIDENCE_MEMO_PREFIX = 'invoiceguard:x402:v2:';
export const HEDERA_X402_ADAPTER_ID = 'hedera-x402-adapter:v2';
export const HEDERA_EVIDENCE_ADAPTER_ID = 'hedera-supplier-evidence-service:v2';

const REQUEST_DOMAIN = 'invoiceguard:supplier-evidence-request:v2';
const QUOTE_DOMAIN = 'invoiceguard:supplier-evidence-quote:v2';
const BENEFICIARY_DOMAIN = 'invoiceguard:beneficiary-fingerprint:v1';
const PAYMENT_ATTESTATION_DOMAIN =
  'invoiceguard:facilitator-payment-attestation:v2';
const RESULT_DOMAIN = 'invoiceguard:supplier-evidence-result:v2';
const SIGNED_PAYMENT_DOMAIN =
  'invoiceguard:signed-facilitator-payment-attestation:v2';
const SIGNED_RESULT_DOMAIN = 'invoiceguard:signed-supplier-evidence-result:v2';
const DEPLOYMENT_POLICY_DOMAIN =
  'invoiceguard:supplier-evidence-deployment-policy:v1';
const SIGNED_DEPLOYMENT_POLICY_DOMAIN =
  'invoiceguard:signed-supplier-evidence-deployment-policy:v1';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ENTITY_ID_PATTERN = /^\d+\.\d+\.\d+$/u;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const MAX_SIGNED_INT64 = 9_223_372_036_854_775_807n;

export type SupplierEvidenceRequestV2 = Readonly<{
  actionDigest: string;
  actionExpiresAt: string;
  evidencePolicyDigest: string;
  evidenceRoot: string;
  invoiceRevisionDigest: string;
  legalIdentityHash: string;
  policyId: string;
  policyVersion: number;
  proposedBeneficiaryFingerprint: string;
  schemaVersion: 'supplier-evidence-request.v2';
  serviceId: string;
  serviceKeyId: string;
  serviceNetworkId: typeof HEDERA_TESTNET_CAIP2;
  supplierSnapshotDigest: string;
}>;

export type SupplierEvidenceQuoteV2 = Readonly<{
  actionDigest: string;
  challengeId: string;
  deploymentAuthorityKeyId: string;
  deploymentPolicyDigest: string;
  evidencePolicyDigest: string;
  expiresAt: string;
  facilitatorFeePayerAccountId: string;
  issuedAt: string;
  maximumTransactionFeeTinybars: string;
  quoteDigest: string;
  quoteId: string;
  requestDigest: string;
  requirements: PaymentRequirements;
  resourceUrl: string;
  schemaVersion: 'supplier-evidence-quote.v2';
  serviceId: string;
  serviceKeyId: string;
  serviceNetworkId: typeof HEDERA_TESTNET_CAIP2;
}>;

export type SupplierEvidenceDeploymentPolicyV1 = Readonly<{
  allowedNodeAccountIds: readonly string[];
  amountTinybars: string;
  deploymentId: string;
  expiresAt: string;
  facilitatorFeePayerAccountId: string;
  maximumTransactionFeeTinybars: string;
  receiverAccountId: string;
  schemaVersion: 'supplier-evidence-deployment-policy.v1';
  serviceId: string;
  serviceKeyId: string;
  serviceNetworkId: typeof HEDERA_TESTNET_CAIP2;
  validFrom: string;
}>;

export type FacilitatorPaymentAttestationBodyV2 = Readonly<{
  actionDigest: string;
  amountTinybars: string;
  asset: typeof HBAR_ASSET_ID;
  challengeId: string;
  paidAt: string;
  payerAccountId: string;
  paymentAttemptId: string;
  paymentTransactionId: string;
  quoteDigest: string;
  quoteId: string;
  receiptStatus: 'SUCCESS';
  receiverAccountId: string;
  requestDigest: string;
  resourceUrl: string;
  schemaVersion: 'facilitator-payment-attestation.v2';
  serviceId: string;
  x402Network: typeof HEDERA_X402_TESTNET_NETWORK;
}>;

export type SupplierEvidenceResultBodyV2 = Readonly<{
  actionDigest: string;
  evidenceRoot: string;
  expiresAt: string;
  issuedAt: string;
  paymentAttemptId: string;
  paymentTransactionId: string;
  quoteDigest: string;
  quoteId: string;
  reasonCodes: readonly string[];
  requestDigest: string;
  result: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
  schemaVersion: 'supplier-evidence-result.v2';
  serviceId: string;
  servicePaymentId: string;
}>;

export type SignedFacilitatorPaymentAttestationV2 =
  SignedEnvelope<FacilitatorPaymentAttestationBodyV2>;
export type SignedSupplierEvidenceResultV2 =
  SignedEnvelope<SupplierEvidenceResultBodyV2>;
export type SignedSupplierEvidenceDeploymentPolicyV1 =
  SignedEnvelope<SupplierEvidenceDeploymentPolicyV1>;

export type VerifiedSupplierEvidenceDeploymentPolicy = Readonly<{
  authorityKeyId: string;
  body: SupplierEvidenceDeploymentPolicyV1;
  policyDigest: string;
}>;

export type SupplierEvidenceBindingContextV2 = Readonly<{
  authorization: AuthorizationBundleV1;
  effect: VerificationQuoteRequestEffect;
  invoice: CanonicalInvoiceV1;
  quote: SupplierEvidenceQuoteV2;
  request: SupplierEvidenceRequestV2;
  signedDeploymentPolicy: SignedSupplierEvidenceDeploymentPolicyV1;
  supplierSnapshot: SupplierMasterSnapshotV1;
  trustedDeploymentAuthority: TrustedEd25519Key;
}>;

export type TrustedEd25519Key = Readonly<{
  keyId: string;
  publicKey: KeyObject;
}>;

export type Ed25519SignatureProvider = Readonly<{
  keyId: string;
  sign(payload: Uint8Array): string;
}>;

type SignedEnvelope<T> = Readonly<{
  algorithm: 'Ed25519';
  body: T;
  keyId: string;
  signature: string;
}>;

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new TypeError(`${label} contains unexpected or missing fields.`);
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be lowercase, unprefixed SHA-256.`);
  }
}

function assertInstant(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError(`${label} must be a canonical UTC instant.`);
  }
}

function assertEntityId(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || !ENTITY_ID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a canonical Hedera entity ID.`);
  }
  try {
    const parsed = parseCanonicalEntityId(value);
    if (
      parsed.aliasKey !== null ||
      parsed.evmAddress !== null ||
      parsed.toString() !== value
    ) {
      throw new TypeError();
    }
  } catch {
    throw new TypeError(`${label} must round-trip as a Hedera entity ID.`);
  }
}

function assertTransactionId(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a canonical Hedera transaction ID.`);
  }
  try {
    const parsed = parseCanonicalTransactionId(value);
    if (
      parsed.accountId === null ||
      parsed.validStart === null ||
      parsed.scheduled === true ||
      (parsed.nonce !== null && !parsed.nonce.isZero()) ||
      parsed.toString() !== value
    ) {
      throw new TypeError();
    }
    assertEntityId(parsed.accountId.toString(), `${label} payer`);
  } catch {
    throw new TypeError(`${label} must round-trip as a transaction ID.`);
  }
}

function assertPositiveTinybars(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{0,18}$/u.test(value) ||
    BigInt(value) > MAX_SIGNED_INT64
  ) {
    throw new TypeError(`${label} must fit a positive signed int64.`);
  }
}

function decodeCanonicalBase64(
  value: unknown,
  label: string,
  expectedLength?: number,
): Buffer {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    !BASE64_PATTERN.test(value)
  ) {
    throw new TypeError(`${label} must be canonical Base64.`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.toString('base64') !== value ||
    (expectedLength !== undefined && decoded.length !== expectedLength)
  ) {
    throw new TypeError(`${label} must round-trip as canonical Base64.`);
  }
  return decoded;
}

function digest(domain: string, value: CanonicalJsonValue): string {
  return createHash('sha256')
    .update(domain, 'ascii')
    .update(Uint8Array.of(0))
    .update(canonicalizeJson(value), 'utf8')
    .digest('hex');
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return (
    canonicalizeJson(left as CanonicalJsonValue) ===
    canonicalizeJson(right as CanonicalJsonValue)
  );
}

function requestAsJson(request: SupplierEvidenceRequestV2): CanonicalJsonValue {
  return request as unknown as CanonicalJsonValue;
}

function quoteCoreAsJson(
  quote: Omit<SupplierEvidenceQuoteV2, 'quoteDigest' | 'requirements'> & {
    requirementCore: Omit<PaymentRequirements, 'extra'>;
  },
): CanonicalJsonValue {
  return quote as unknown as CanonicalJsonValue;
}

function signingPayload(domain: string, body: CanonicalJsonValue): Buffer {
  return Buffer.from(`${domain}\0${canonicalizeJson(body)}`, 'utf8');
}

function signEnvelope<T extends Readonly<Record<string, unknown>>>(
  domain: string,
  body: T,
  signer: Ed25519SignatureProvider,
): SignedEnvelope<T> {
  if (signer.keyId.length === 0) {
    throw new TypeError('Signer key ID must not be empty.');
  }
  const signature = signer.sign(
    signingPayload(domain, body as unknown as CanonicalJsonValue),
  );
  decodeCanonicalBase64(signature, 'Ed25519 signature', 64);
  return Object.freeze({
    algorithm: 'Ed25519',
    body,
    keyId: signer.keyId,
    signature,
  });
}

function verifyEnvelope<T extends Readonly<Record<string, unknown>>>(
  domain: string,
  envelope: SignedEnvelope<T>,
  trusted: TrustedEd25519Key,
): void {
  assertRecord(envelope, 'signed evidence envelope');
  assertExactKeys(
    envelope,
    ['algorithm', 'body', 'keyId', 'signature'],
    'signed evidence envelope',
  );
  let signature: Buffer;
  try {
    signature = decodeCanonicalBase64(
      envelope.signature,
      'Ed25519 signature',
      64,
    );
  } catch {
    throw new TypeError('Signed evidence envelope is not trusted.');
  }
  if (
    envelope.algorithm !== 'Ed25519' ||
    envelope.keyId !== trusted.keyId ||
    trusted.publicKey.type !== 'public' ||
    trusted.publicKey.asymmetricKeyType !== 'ed25519' ||
    !verify(
      null,
      signingPayload(domain, envelope.body as unknown as CanonicalJsonValue),
      trusted.publicKey,
      signature,
    )
  ) {
    throw new TypeError('Signed evidence envelope is not trusted.');
  }
}

function validateDeploymentPolicyBody(
  body: SupplierEvidenceDeploymentPolicyV1,
): void {
  assertRecord(body, 'supplier evidence deployment policy');
  assertExactKeys(
    body,
    [
      'allowedNodeAccountIds',
      'amountTinybars',
      'deploymentId',
      'expiresAt',
      'facilitatorFeePayerAccountId',
      'maximumTransactionFeeTinybars',
      'receiverAccountId',
      'schemaVersion',
      'serviceId',
      'serviceKeyId',
      'serviceNetworkId',
      'validFrom',
    ],
    'supplier evidence deployment policy',
  );
  assertPositiveTinybars(body.amountTinybars, 'deployment payment amount');
  assertPositiveTinybars(
    body.maximumTransactionFeeTinybars,
    'deployment transaction fee cap',
  );
  assertEntityId(
    body.facilitatorFeePayerAccountId,
    'deployment facilitator fee payer',
  );
  assertEntityId(body.receiverAccountId, 'deployment service receiver');
  assertInstant(body.validFrom, 'deployment policy validFrom');
  assertInstant(body.expiresAt, 'deployment policy expiresAt');
  if (!Array.isArray(body.allowedNodeAccountIds)) {
    throw new TypeError('Deployment node allowlist must be an array.');
  }
  for (const nodeAccountId of body.allowedNodeAccountIds) {
    assertEntityId(nodeAccountId, 'deployment node account');
  }
  if (
    body.schemaVersion !== 'supplier-evidence-deployment-policy.v1' ||
    body.serviceNetworkId !== HEDERA_TESTNET_CAIP2 ||
    typeof body.deploymentId !== 'string' ||
    body.deploymentId.length === 0 ||
    typeof body.serviceId !== 'string' ||
    body.serviceId.length === 0 ||
    typeof body.serviceKeyId !== 'string' ||
    body.serviceKeyId.length === 0 ||
    body.validFrom >= body.expiresAt ||
    body.allowedNodeAccountIds.length === 0 ||
    body.allowedNodeAccountIds.some((node, index) => {
      const previous = body.allowedNodeAccountIds[index - 1];
      return previous !== undefined && previous >= node;
    })
  ) {
    throw new TypeError('Supplier evidence deployment policy is invalid.');
  }
}

export function signSupplierEvidenceDeploymentPolicyV1(
  body: SupplierEvidenceDeploymentPolicyV1,
  signer: Ed25519SignatureProvider,
): SignedSupplierEvidenceDeploymentPolicyV1 {
  validateDeploymentPolicyBody(body);
  return signEnvelope(DEPLOYMENT_POLICY_DOMAIN, body, signer);
}

export function verifySupplierEvidenceDeploymentPolicyV1(
  signedPolicy: SignedSupplierEvidenceDeploymentPolicyV1,
  trustedAuthority: TrustedEd25519Key,
  at: Date,
): VerifiedSupplierEvidenceDeploymentPolicy {
  validateDeploymentPolicyBody(signedPolicy.body);
  verifyEnvelope(DEPLOYMENT_POLICY_DOMAIN, signedPolicy, trustedAuthority);
  if (
    Number.isNaN(at.valueOf()) ||
    at.toISOString() < signedPolicy.body.validFrom ||
    at.toISOString() >= signedPolicy.body.expiresAt
  ) {
    throw new TypeError('Supplier evidence deployment policy is not current.');
  }
  return Object.freeze({
    authorityKeyId: signedPolicy.keyId,
    body: signedPolicy.body,
    policyDigest: digest(
      SIGNED_DEPLOYMENT_POLICY_DOMAIN,
      signedPolicy as unknown as CanonicalJsonValue,
    ),
  });
}

function assertEffectBinding(
  authorizationInput: AuthorizationBundleV1,
  effect: VerificationQuoteRequestEffect,
): AuthorizationBundleV1 {
  const authorization = verifyAuthorizationBundle(authorizationInput);
  const policy = authorization.decision.evidencePolicy;
  if (
    effect.type !== 'VERIFICATION_QUOTE_REQUEST' ||
    authorization.decision.verificationMode !== 'REQUIRED' ||
    effect.actionDigest !== authorization.envelope.actionDigest ||
    effect.evidencePolicyDigest !== policy.digest ||
    effect.expiresAt !== authorization.actionCore.expiresAt ||
    effect.serviceId !== policy.serviceId ||
    effect.serviceKeyId !== policy.serviceKeyId ||
    effect.serviceNetworkId !== policy.serviceNetworkId ||
    effect.serviceNetworkId !== HEDERA_TESTNET_CAIP2
  ) {
    throw new TypeError(
      'Verification effect does not bind the frozen AP authorization.',
    );
  }
  return authorization;
}

export function beneficiaryFingerprint(beneficiary: BeneficiaryV1): string {
  return digest(
    BENEFICIARY_DOMAIN,
    beneficiary as unknown as CanonicalJsonValue,
  );
}

export function supplierEvidenceRequestDigest(
  request: SupplierEvidenceRequestV2,
): string {
  parseSupplierEvidenceRequestV2(request);
  return digest(REQUEST_DOMAIN, requestAsJson(request));
}

export function supplierEvidenceRoute(actionDigest: string): string {
  assertDigest(actionDigest, 'actionDigest');
  return `${SUPPLIER_EVIDENCE_ROUTE_PREFIX}${actionDigest}`;
}

export function supplierEvidenceMemo(requestDigest: string): string {
  assertDigest(requestDigest, 'requestDigest');
  const memo = `${SUPPLIER_EVIDENCE_MEMO_PREFIX}${requestDigest}`;
  if (Buffer.byteLength(memo, 'utf8') > 100) {
    throw new TypeError('Supplier evidence memo exceeds Hedera limits.');
  }
  return memo;
}

export function toX402TestnetNetwork(networkId: string): string {
  if (networkId !== HEDERA_TESTNET_CAIP2) {
    throw new TypeError('Only Hedera Testnet CAIP-2 is admitted.');
  }
  return HEDERA_X402_TESTNET_NETWORK;
}

export function hederaAccountFromCaip10(accountId: string): string {
  const prefix = `${HEDERA_TESTNET_CAIP2}:`;
  if (!accountId.startsWith(prefix)) {
    throw new TypeError('Account is not on Hedera Testnet.');
  }
  const entityId = accountId.slice(prefix.length);
  assertEntityId(entityId, 'Hedera account');
  return entityId;
}

export function createSupplierEvidenceRequestV2(
  authorizationInput: AuthorizationBundleV1,
  effect: VerificationQuoteRequestEffect,
  invoiceInput: CanonicalInvoiceV1,
  supplierSnapshotInput: SupplierMasterSnapshotV1,
): SupplierEvidenceRequestV2 {
  const authorization = assertEffectBinding(authorizationInput, effect);
  const invoice = invoiceInput;
  const snapshot = verifySupplierMasterSnapshot(supplierSnapshotInput);
  const action = authorization.actionCore;
  if (
    hashCanonicalInvoice(invoice) !== action.sourceInvoice.digest ||
    invoice.invoiceRevisionId !== action.sourceInvoice.invoiceRevisionId ||
    invoice.obligationId !== action.sourceInvoice.obligationId ||
    invoice.organizationId !== action.organizationId ||
    invoice.supplierId !== action.supplierId ||
    invoice.supplierSnapshotDigest !== action.supplierSnapshotDigest ||
    invoice.totalAmountAtoms !== action.sourceInvoice.amountAtoms ||
    invoice.invoiceAssetId !== action.sourceInvoice.assetId ||
    invoice.sourceEvidenceRoot !== action.evidenceRoot ||
    !sameCanonical(invoice.proposedBeneficiary, action.beneficiary.proposed) ||
    snapshot.snapshotDigest !== action.supplierSnapshotDigest ||
    snapshot.organizationId !== action.organizationId ||
    snapshot.supplierId !== action.supplierId
  ) {
    throw new TypeError(
      'Invoice or supplier snapshot differs from the frozen AP action.',
    );
  }
  return Object.freeze({
    actionDigest: authorization.envelope.actionDigest,
    actionExpiresAt: action.expiresAt,
    evidencePolicyDigest: effect.evidencePolicyDigest,
    evidenceRoot: action.evidenceRoot,
    invoiceRevisionDigest: action.sourceInvoice.digest,
    legalIdentityHash: snapshot.legalIdentityHash,
    policyId: action.policy.id,
    policyVersion: action.policy.version,
    proposedBeneficiaryFingerprint: beneficiaryFingerprint(
      action.beneficiary.proposed,
    ),
    schemaVersion: 'supplier-evidence-request.v2',
    serviceId: effect.serviceId,
    serviceKeyId: effect.serviceKeyId,
    serviceNetworkId: HEDERA_TESTNET_CAIP2,
    supplierSnapshotDigest: action.supplierSnapshotDigest,
  });
}

export function parseSupplierEvidenceRequestV2(
  input: unknown,
): SupplierEvidenceRequestV2 {
  assertRecord(input, 'supplier evidence request');
  assertExactKeys(
    input,
    [
      'actionDigest',
      'actionExpiresAt',
      'evidencePolicyDigest',
      'evidenceRoot',
      'invoiceRevisionDigest',
      'legalIdentityHash',
      'policyId',
      'policyVersion',
      'proposedBeneficiaryFingerprint',
      'schemaVersion',
      'serviceId',
      'serviceKeyId',
      'serviceNetworkId',
      'supplierSnapshotDigest',
    ],
    'supplier evidence request',
  );
  for (const field of [
    'actionDigest',
    'evidencePolicyDigest',
    'evidenceRoot',
    'invoiceRevisionDigest',
    'legalIdentityHash',
    'proposedBeneficiaryFingerprint',
    'supplierSnapshotDigest',
  ]) {
    assertDigest(input[field], `supplier evidence request ${field}`);
  }
  assertInstant(input.actionExpiresAt, 'supplier evidence request expiry');
  if (
    input.schemaVersion !== 'supplier-evidence-request.v2' ||
    input.serviceNetworkId !== HEDERA_TESTNET_CAIP2 ||
    typeof input.policyId !== 'string' ||
    input.policyId.length === 0 ||
    !Number.isSafeInteger(input.policyVersion) ||
    (input.policyVersion as number) <= 0 ||
    typeof input.serviceId !== 'string' ||
    input.serviceId.length === 0 ||
    typeof input.serviceKeyId !== 'string' ||
    input.serviceKeyId.length === 0
  ) {
    throw new TypeError('Supplier evidence request is invalid.');
  }
  return Object.freeze({ ...input }) as SupplierEvidenceRequestV2;
}

export function createSupplierEvidenceQuoteV2(
  requestInput: SupplierEvidenceRequestV2,
  signedDeploymentPolicy: SignedSupplierEvidenceDeploymentPolicyV1,
  trustedDeploymentAuthority: TrustedEd25519Key,
  options: Readonly<{
    challengeId: string;
    now: Date;
    quoteId: string;
    quoteTtlSeconds: number;
  }>,
): SupplierEvidenceQuoteV2 {
  const request = parseSupplierEvidenceRequestV2(requestInput);
  const deployment = verifySupplierEvidenceDeploymentPolicyV1(
    signedDeploymentPolicy,
    trustedDeploymentAuthority,
    options.now,
  );
  const deploymentPolicy = deployment.body;
  if (
    deploymentPolicy.serviceId !== request.serviceId ||
    deploymentPolicy.serviceKeyId !== request.serviceKeyId ||
    deploymentPolicy.serviceNetworkId !== request.serviceNetworkId
  ) {
    throw new TypeError(
      'Deployment policy does not authorize the AP evidence service.',
    );
  }
  if (
    !CHALLENGE_PATTERN.test(options.challengeId) ||
    options.quoteId.length === 0 ||
    !Number.isInteger(options.quoteTtlSeconds) ||
    options.quoteTtlSeconds < 1 ||
    options.quoteTtlSeconds > 300 ||
    Number.isNaN(options.now.valueOf()) ||
    options.now.toISOString() >= request.actionExpiresAt
  ) {
    throw new TypeError('Supplier evidence quote options are invalid.');
  }
  const expiresAt = new Date(
    Math.min(
      options.now.valueOf() + options.quoteTtlSeconds * 1_000,
      Date.parse(request.actionExpiresAt),
      Date.parse(deploymentPolicy.expiresAt),
    ),
  ).toISOString();
  const requestDigest = supplierEvidenceRequestDigest(request);
  const resourceUrl = supplierEvidenceRoute(request.actionDigest);
  const requirementCore = Object.freeze({
    amount: deploymentPolicy.amountTinybars,
    asset: HBAR_ASSET_ID,
    maxTimeoutSeconds: options.quoteTtlSeconds,
    network: HEDERA_X402_TESTNET_NETWORK,
    payTo: deploymentPolicy.receiverAccountId,
    scheme: 'exact',
  }) satisfies Omit<PaymentRequirements, 'extra'>;
  const core = Object.freeze({
    actionDigest: request.actionDigest,
    challengeId: options.challengeId,
    deploymentAuthorityKeyId: deployment.authorityKeyId,
    deploymentPolicyDigest: deployment.policyDigest,
    evidencePolicyDigest: request.evidencePolicyDigest,
    expiresAt,
    facilitatorFeePayerAccountId: deploymentPolicy.facilitatorFeePayerAccountId,
    issuedAt: options.now.toISOString(),
    maximumTransactionFeeTinybars:
      deploymentPolicy.maximumTransactionFeeTinybars,
    quoteId: options.quoteId,
    requestDigest,
    requirementCore,
    resourceUrl,
    schemaVersion: 'supplier-evidence-quote.v2' as const,
    serviceId: request.serviceId,
    serviceKeyId: request.serviceKeyId,
    serviceNetworkId: request.serviceNetworkId,
  });
  const quoteDigest = digest(QUOTE_DOMAIN, quoteCoreAsJson(core));
  return Object.freeze({
    actionDigest: core.actionDigest,
    challengeId: core.challengeId,
    deploymentAuthorityKeyId: core.deploymentAuthorityKeyId,
    deploymentPolicyDigest: core.deploymentPolicyDigest,
    evidencePolicyDigest: core.evidencePolicyDigest,
    expiresAt: core.expiresAt,
    facilitatorFeePayerAccountId: core.facilitatorFeePayerAccountId,
    issuedAt: core.issuedAt,
    maximumTransactionFeeTinybars: core.maximumTransactionFeeTinybars,
    quoteDigest,
    quoteId: core.quoteId,
    requestDigest: core.requestDigest,
    requirements: Object.freeze({
      ...requirementCore,
      extra: Object.freeze({
        actionDigest: core.actionDigest,
        challengeId: core.challengeId,
        deploymentAuthorityKeyId: core.deploymentAuthorityKeyId,
        deploymentPolicyDigest: core.deploymentPolicyDigest,
        evidencePolicyDigest: core.evidencePolicyDigest,
        expiresAt: core.expiresAt,
        facilitatorFeePayerAccountId: core.facilitatorFeePayerAccountId,
        maximumTransactionFeeTinybars: core.maximumTransactionFeeTinybars,
        quoteDigest,
        quoteId: core.quoteId,
        requestDigest: core.requestDigest,
        resourceUrl: core.resourceUrl,
        serviceId: core.serviceId,
        serviceKeyId: core.serviceKeyId,
        serviceNetworkId: core.serviceNetworkId,
      }),
    }),
    resourceUrl: core.resourceUrl,
    schemaVersion: core.schemaVersion,
    serviceId: core.serviceId,
    serviceKeyId: core.serviceKeyId,
    serviceNetworkId: core.serviceNetworkId,
  });
}

function assertQuoteBinding(
  request: SupplierEvidenceRequestV2,
  quote: SupplierEvidenceQuoteV2,
  deployment: VerifiedSupplierEvidenceDeploymentPolicy,
): void {
  assertRecord(quote, 'supplier evidence quote');
  assertExactKeys(
    quote,
    [
      'actionDigest',
      'challengeId',
      'deploymentAuthorityKeyId',
      'deploymentPolicyDigest',
      'evidencePolicyDigest',
      'expiresAt',
      'facilitatorFeePayerAccountId',
      'issuedAt',
      'maximumTransactionFeeTinybars',
      'quoteDigest',
      'quoteId',
      'requestDigest',
      'requirements',
      'resourceUrl',
      'schemaVersion',
      'serviceId',
      'serviceKeyId',
      'serviceNetworkId',
    ],
    'supplier evidence quote',
  );
  assertRecord(quote.requirements, 'quoted payment requirements');
  assertExactKeys(
    quote.requirements,
    [
      'amount',
      'asset',
      'extra',
      'maxTimeoutSeconds',
      'network',
      'payTo',
      'scheme',
    ],
    'quoted payment requirements',
  );
  assertRecord(quote.requirements.extra, 'quoted requirements metadata');
  const extra = quote.requirements.extra;
  assertExactKeys(
    extra,
    [
      'actionDigest',
      'challengeId',
      'deploymentAuthorityKeyId',
      'deploymentPolicyDigest',
      'evidencePolicyDigest',
      'expiresAt',
      'facilitatorFeePayerAccountId',
      'maximumTransactionFeeTinybars',
      'quoteDigest',
      'quoteId',
      'requestDigest',
      'resourceUrl',
      'serviceId',
      'serviceKeyId',
      'serviceNetworkId',
    ],
    'quoted requirements metadata',
  );
  for (const [value, label] of [
    [quote.actionDigest, 'supplier evidence quote actionDigest'],
    [
      quote.deploymentPolicyDigest,
      'supplier evidence quote deploymentPolicyDigest',
    ],
    [
      quote.evidencePolicyDigest,
      'supplier evidence quote evidencePolicyDigest',
    ],
    [quote.quoteDigest, 'supplier evidence quote quoteDigest'],
    [quote.requestDigest, 'supplier evidence quote requestDigest'],
  ] as const) {
    assertDigest(value, label);
  }
  const expectedCore = {
    amount: quote.requirements.amount,
    asset: quote.requirements.asset,
    maxTimeoutSeconds: quote.requirements.maxTimeoutSeconds,
    network: quote.requirements.network,
    payTo: quote.requirements.payTo,
    scheme: quote.requirements.scheme,
  } satisfies Omit<PaymentRequirements, 'extra'>;
  const expectedQuoteDigest = digest(
    QUOTE_DOMAIN,
    quoteCoreAsJson({
      actionDigest: quote.actionDigest,
      challengeId: quote.challengeId,
      deploymentAuthorityKeyId: quote.deploymentAuthorityKeyId,
      deploymentPolicyDigest: quote.deploymentPolicyDigest,
      evidencePolicyDigest: quote.evidencePolicyDigest,
      expiresAt: quote.expiresAt,
      facilitatorFeePayerAccountId: quote.facilitatorFeePayerAccountId,
      issuedAt: quote.issuedAt,
      maximumTransactionFeeTinybars: quote.maximumTransactionFeeTinybars,
      quoteId: quote.quoteId,
      requestDigest: quote.requestDigest,
      requirementCore: expectedCore,
      resourceUrl: quote.resourceUrl,
      schemaVersion: 'supplier-evidence-quote.v2',
      serviceId: quote.serviceId,
      serviceKeyId: quote.serviceKeyId,
      serviceNetworkId: quote.serviceNetworkId,
    }),
  );
  if (
    quote.schemaVersion !== 'supplier-evidence-quote.v2' ||
    quote.actionDigest !== request.actionDigest ||
    deployment.body.serviceId !== request.serviceId ||
    deployment.body.serviceKeyId !== request.serviceKeyId ||
    deployment.body.serviceNetworkId !== request.serviceNetworkId ||
    quote.deploymentAuthorityKeyId !== deployment.authorityKeyId ||
    quote.deploymentPolicyDigest !== deployment.policyDigest ||
    quote.requestDigest !== supplierEvidenceRequestDigest(request) ||
    quote.evidencePolicyDigest !== request.evidencePolicyDigest ||
    quote.serviceId !== request.serviceId ||
    quote.serviceKeyId !== request.serviceKeyId ||
    quote.serviceNetworkId !== request.serviceNetworkId ||
    quote.resourceUrl !== supplierEvidenceRoute(request.actionDigest) ||
    quote.issuedAt >= quote.expiresAt ||
    quote.expiresAt > request.actionExpiresAt ||
    quote.expiresAt > deployment.body.expiresAt ||
    quote.quoteDigest !== expectedQuoteDigest ||
    quote.requirements.scheme !== 'exact' ||
    quote.requirements.network !== HEDERA_X402_TESTNET_NETWORK ||
    quote.requirements.asset !== HBAR_ASSET_ID ||
    quote.requirements.amount !== deployment.body.amountTinybars ||
    quote.requirements.payTo !== deployment.body.receiverAccountId ||
    quote.facilitatorFeePayerAccountId !==
      deployment.body.facilitatorFeePayerAccountId ||
    quote.maximumTransactionFeeTinybars !==
      deployment.body.maximumTransactionFeeTinybars ||
    !Number.isInteger(quote.requirements.maxTimeoutSeconds) ||
    quote.requirements.maxTimeoutSeconds < 1 ||
    quote.requirements.maxTimeoutSeconds > 300 ||
    extra.actionDigest !== quote.actionDigest ||
    extra.challengeId !== quote.challengeId ||
    extra.deploymentAuthorityKeyId !== quote.deploymentAuthorityKeyId ||
    extra.deploymentPolicyDigest !== quote.deploymentPolicyDigest ||
    extra.evidencePolicyDigest !== quote.evidencePolicyDigest ||
    extra.expiresAt !== quote.expiresAt ||
    extra.facilitatorFeePayerAccountId !== quote.facilitatorFeePayerAccountId ||
    extra.maximumTransactionFeeTinybars !==
      quote.maximumTransactionFeeTinybars ||
    extra.quoteDigest !== quote.quoteDigest ||
    extra.quoteId !== quote.quoteId ||
    extra.requestDigest !== quote.requestDigest ||
    extra.resourceUrl !== quote.resourceUrl ||
    extra.serviceId !== quote.serviceId ||
    extra.serviceKeyId !== quote.serviceKeyId ||
    extra.serviceNetworkId !== quote.serviceNetworkId
  ) {
    throw new TypeError('Supplier evidence quote is not bound to the request.');
  }
  assertPositiveTinybars(quote.requirements.amount, 'quoted payment amount');
  assertPositiveTinybars(
    quote.maximumTransactionFeeTinybars,
    'quoted transaction fee cap',
  );
  assertEntityId(quote.requirements.payTo, 'quoted service receiver');
  assertEntityId(
    quote.facilitatorFeePayerAccountId,
    'quoted facilitator fee payer',
  );
  assertInstant(quote.issuedAt, 'supplier evidence quote issuedAt');
  assertInstant(quote.expiresAt, 'supplier evidence quote expiry');
  if (!CHALLENGE_PATTERN.test(quote.challengeId)) {
    throw new TypeError('Supplier evidence quote challenge is malformed.');
  }
}

export function verifySupplierEvidenceQuoteV2(
  requestInput: SupplierEvidenceRequestV2,
  quote: SupplierEvidenceQuoteV2,
  signedDeploymentPolicy: SignedSupplierEvidenceDeploymentPolicyV1,
  trustedDeploymentAuthority: TrustedEd25519Key,
): SupplierEvidenceQuoteV2 {
  const request = parseSupplierEvidenceRequestV2(requestInput);
  const deployment = verifySupplierEvidenceDeploymentPolicyV1(
    signedDeploymentPolicy,
    trustedDeploymentAuthority,
    new Date(quote.issuedAt),
  );
  assertQuoteBinding(request, quote, deployment);
  return Object.freeze({ ...quote });
}

export function verifySupplierEvidenceBindingContextV2(
  context: SupplierEvidenceBindingContextV2,
): {
  authorization: AuthorizationBundleV1;
  deployment: VerifiedSupplierEvidenceDeploymentPolicy;
  quote: SupplierEvidenceQuoteV2;
  request: SupplierEvidenceRequestV2;
} {
  const authorization = assertEffectBinding(
    context.authorization,
    context.effect,
  );
  const expectedRequest = createSupplierEvidenceRequestV2(
    authorization,
    context.effect,
    context.invoice,
    context.supplierSnapshot,
  );
  const request = parseSupplierEvidenceRequestV2(context.request);
  if (!sameCanonical(request, expectedRequest)) {
    throw new TypeError(
      'Supplier evidence request was not derived from the current AP inputs.',
    );
  }
  const deployment = verifySupplierEvidenceDeploymentPolicyV1(
    context.signedDeploymentPolicy,
    context.trustedDeploymentAuthority,
    new Date(context.quote.issuedAt),
  );
  const quote = verifySupplierEvidenceQuoteV2(
    request,
    context.quote,
    context.signedDeploymentPolicy,
    context.trustedDeploymentAuthority,
  );
  return { authorization, deployment, quote, request };
}

export function signFacilitatorPaymentAttestationV2(
  body: FacilitatorPaymentAttestationBodyV2,
  signer: Ed25519SignatureProvider,
): SignedFacilitatorPaymentAttestationV2 {
  validatePaymentBody(body);
  return signEnvelope(PAYMENT_ATTESTATION_DOMAIN, body, signer);
}

export function signSupplierEvidenceResultV2(
  body: SupplierEvidenceResultBodyV2,
  signer: Ed25519SignatureProvider,
): SignedSupplierEvidenceResultV2 {
  validateResultBody(body);
  return signEnvelope(RESULT_DOMAIN, body, signer);
}

function validatePaymentBody(body: FacilitatorPaymentAttestationBodyV2): void {
  assertRecord(body, 'facilitator payment attestation');
  assertExactKeys(
    body,
    [
      'actionDigest',
      'amountTinybars',
      'asset',
      'challengeId',
      'paidAt',
      'payerAccountId',
      'paymentAttemptId',
      'paymentTransactionId',
      'quoteDigest',
      'quoteId',
      'receiptStatus',
      'receiverAccountId',
      'requestDigest',
      'resourceUrl',
      'schemaVersion',
      'serviceId',
      'x402Network',
    ],
    'facilitator payment attestation',
  );
  for (const field of [
    'actionDigest',
    'quoteDigest',
    'requestDigest',
  ] as const) {
    assertDigest(body[field], `payment attestation ${field}`);
  }
  assertInstant(body.paidAt, 'payment attestation paidAt');
  assertEntityId(body.payerAccountId, 'payment payer');
  assertEntityId(body.receiverAccountId, 'payment receiver');
  assertPositiveTinybars(body.amountTinybars, 'payment amount');
  assertTransactionId(body.paymentTransactionId, 'payment transaction ID');
  if (
    body.schemaVersion !== 'facilitator-payment-attestation.v2' ||
    body.receiptStatus !== 'SUCCESS' ||
    body.asset !== HBAR_ASSET_ID ||
    body.x402Network !== HEDERA_X402_TESTNET_NETWORK ||
    !CHALLENGE_PATTERN.test(body.challengeId) ||
    typeof body.paymentAttemptId !== 'string' ||
    body.paymentAttemptId.length === 0 ||
    typeof body.quoteId !== 'string' ||
    body.quoteId.length === 0 ||
    typeof body.resourceUrl !== 'string' ||
    body.resourceUrl.length === 0 ||
    typeof body.serviceId !== 'string' ||
    body.serviceId.length === 0
  ) {
    throw new TypeError('Facilitator payment attestation is invalid.');
  }
}

function validateResultBody(body: SupplierEvidenceResultBodyV2): void {
  assertRecord(body, 'supplier evidence result');
  assertExactKeys(
    body,
    [
      'actionDigest',
      'evidenceRoot',
      'expiresAt',
      'issuedAt',
      'paymentAttemptId',
      'paymentTransactionId',
      'quoteDigest',
      'quoteId',
      'reasonCodes',
      'requestDigest',
      'result',
      'schemaVersion',
      'serviceId',
      'servicePaymentId',
    ],
    'supplier evidence result',
  );
  for (const field of [
    'actionDigest',
    'evidenceRoot',
    'quoteDigest',
    'requestDigest',
    'servicePaymentId',
  ] as const) {
    assertDigest(body[field], `supplier evidence result ${field}`);
  }
  assertInstant(body.issuedAt, 'supplier evidence result issuedAt');
  assertInstant(body.expiresAt, 'supplier evidence result expiresAt');
  assertTransactionId(
    body.paymentTransactionId,
    'evidence payment transaction ID',
  );
  if (
    body.schemaVersion !== 'supplier-evidence-result.v2' ||
    !['MATCH', 'MISMATCH', 'UNKNOWN'].includes(body.result) ||
    body.issuedAt >= body.expiresAt ||
    typeof body.paymentAttemptId !== 'string' ||
    body.paymentAttemptId.length === 0 ||
    typeof body.quoteId !== 'string' ||
    body.quoteId.length === 0 ||
    typeof body.serviceId !== 'string' ||
    body.serviceId.length === 0 ||
    !Array.isArray(body.reasonCodes) ||
    body.reasonCodes.some((reason, index) => {
      const previous = body.reasonCodes[index - 1];
      return (
        typeof reason !== 'string' ||
        reason.length === 0 ||
        (previous !== undefined && previous >= reason)
      );
    })
  ) {
    throw new TypeError('Supplier evidence result is invalid.');
  }
}

function signedEnvelopeDigest(
  domain: string,
  envelope: SignedEnvelope<Readonly<Record<string, unknown>>>,
): string {
  return digest(domain, envelope as unknown as CanonicalJsonValue);
}

function verifyFacilitatorPaymentAttestationForContext(
  context: SupplierEvidenceBindingContextV2,
  signedPayment: SignedFacilitatorPaymentAttestationV2,
  trustedFacilitator: TrustedEd25519Key,
): ReturnType<typeof verifySupplierEvidenceBindingContextV2> & {
  body: FacilitatorPaymentAttestationBodyV2;
} {
  const binding = verifySupplierEvidenceBindingContextV2(context);
  const { quote, request } = binding;
  validatePaymentBody(signedPayment.body);
  verifyEnvelope(PAYMENT_ATTESTATION_DOMAIN, signedPayment, trustedFacilitator);
  const body = signedPayment.body;
  const transactionId = parseCanonicalTransactionId(body.paymentTransactionId);
  if (
    body.actionDigest !== request.actionDigest ||
    body.requestDigest !== quote.requestDigest ||
    body.quoteDigest !== quote.quoteDigest ||
    body.quoteId !== quote.quoteId ||
    body.challengeId !== quote.challengeId ||
    body.resourceUrl !== quote.resourceUrl ||
    body.serviceId !== quote.serviceId ||
    body.amountTinybars !== quote.requirements.amount ||
    body.receiverAccountId !== quote.requirements.payTo ||
    transactionId.accountId?.toString() !==
      quote.facilitatorFeePayerAccountId ||
    body.paidAt < quote.issuedAt ||
    body.paidAt >= quote.expiresAt
  ) {
    throw new TypeError(
      'Facilitator payment does not bind the issued supplier evidence quote.',
    );
  }
  return {
    ...binding,
    body: Object.freeze({ ...body }),
  };
}

/**
 * Revalidates the complete strict facilitator envelope against an
 * application-configured trust anchor and the fully re-derived AP quote.
 *
 * The envelope key ID is descriptive only; it never selects its own trust
 * anchor.
 */
export function verifyFacilitatorPaymentAttestationV2(
  context: SupplierEvidenceBindingContextV2,
  signedPayment: SignedFacilitatorPaymentAttestationV2,
  trustedFacilitator: TrustedEd25519Key,
): FacilitatorPaymentAttestationBodyV2 {
  return verifyFacilitatorPaymentAttestationForContext(
    context,
    signedPayment,
    trustedFacilitator,
  ).body;
}

export function createVerificationPaymentFact(
  context: SupplierEvidenceBindingContextV2,
  signedPayment: SignedFacilitatorPaymentAttestationV2,
  trustedFacilitator: TrustedEd25519Key,
): AdapterVerifiedVerificationPayment {
  const { authorization, body } = verifyFacilitatorPaymentAttestationForContext(
    context,
    signedPayment,
    trustedFacilitator,
  );
  return createAdapterVerifiedVerificationPayment(authorization, {
    adapterId: HEDERA_X402_ADAPTER_ID,
    paidAt: body.paidAt,
    paymentAttemptId: body.paymentAttemptId,
    paymentNetworkId: HEDERA_TESTNET_CAIP2,
    paymentTransactionId: body.paymentTransactionId,
    quoteDigest: body.quoteDigest,
    quoteId: body.quoteId,
    servicePaymentId: signedEnvelopeDigest(
      SIGNED_PAYMENT_DOMAIN,
      signedPayment,
    ),
    serviceRequestDigest: body.requestDigest,
  });
}

function revalidateVerificationPayment(
  authorization: AuthorizationBundleV1,
  request: SupplierEvidenceRequestV2,
  quote: SupplierEvidenceQuoteV2,
  paymentInput: AdapterVerifiedVerificationPayment,
): AdapterVerifiedVerificationPayment {
  const payment = parseAdapterVerifiedVerificationPayment(paymentInput);
  const action = authorization.actionCore;
  const policy = authorization.decision.evidencePolicy;
  if (
    payment === null ||
    payment.adapterId !== HEDERA_X402_ADAPTER_ID ||
    payment.actionDigest !== authorization.envelope.actionDigest ||
    payment.actionId !== action.actionId ||
    payment.invoiceRevisionId !== action.sourceInvoice.invoiceRevisionId ||
    payment.nonce !== action.nonce ||
    payment.obligationId !== action.sourceInvoice.obligationId ||
    payment.organizationId !== action.organizationId ||
    payment.evidencePolicyDigest !== request.evidencePolicyDigest ||
    payment.serviceRequestDigest !== supplierEvidenceRequestDigest(request) ||
    payment.quoteDigest !== quote.quoteDigest ||
    payment.quoteId !== quote.quoteId ||
    payment.serviceId !== policy.serviceId ||
    payment.serviceKeyId !== policy.serviceKeyId ||
    payment.serviceNetworkId !== policy.serviceNetworkId ||
    payment.paymentNetworkId !== HEDERA_TESTNET_CAIP2 ||
    payment.paidAt < quote.issuedAt ||
    payment.paidAt >= quote.expiresAt ||
    payment.paidAt >= action.expiresAt
  ) {
    throw new TypeError(
      'Verification payment is not current for the AP authorization.',
    );
  }
  return payment;
}

export function createEvidenceResultFact(
  context: SupplierEvidenceBindingContextV2,
  paymentInput: AdapterVerifiedVerificationPayment,
  signedResult: SignedSupplierEvidenceResultV2,
  trustedService: TrustedEd25519Key,
): AdapterVerifiedEvidenceResult {
  const { authorization, quote, request } =
    verifySupplierEvidenceBindingContextV2(context);
  const payment = revalidateVerificationPayment(
    authorization,
    request,
    quote,
    paymentInput,
  );
  validateResultBody(signedResult.body);
  verifyEnvelope(RESULT_DOMAIN, signedResult, trustedService);
  const body = signedResult.body;
  if (
    signedResult.keyId !== context.effect.serviceKeyId ||
    body.actionDigest !== authorization.envelope.actionDigest ||
    body.evidenceRoot !== authorization.actionCore.evidenceRoot ||
    body.requestDigest !== payment.serviceRequestDigest ||
    body.quoteDigest !== payment.quoteDigest ||
    body.quoteId !== payment.quoteId ||
    body.paymentAttemptId !== payment.paymentAttemptId ||
    body.paymentTransactionId !== payment.paymentTransactionId ||
    body.serviceId !== payment.serviceId ||
    body.servicePaymentId !== payment.servicePaymentId ||
    body.issuedAt < payment.paidAt ||
    body.expiresAt > authorization.actionCore.expiresAt
  ) {
    throw new TypeError(
      'Supplier evidence result does not bind the AP payment and action.',
    );
  }
  return createAdapterVerifiedEvidenceResult(authorization, payment, {
    adapterId: HEDERA_EVIDENCE_ADAPTER_ID,
    evidenceResultId: signedEnvelopeDigest(SIGNED_RESULT_DOMAIN, signedResult),
    evidenceRoot: body.evidenceRoot,
    expiresAt: body.expiresAt,
    result: body.result,
    verifiedAt: body.issuedAt,
  });
}
