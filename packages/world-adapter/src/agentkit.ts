import { createHash, randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  buildAgentkitSchema,
  createAgentkitClient,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
  type AgentkitExtension,
  type AgentkitPayload,
  type AgentkitSigner,
} from '@worldcoin/agentkit';
import { getAddress, isAddress } from 'viem';

import {
  INVOICEGUARD_AGENTKIT_STATEMENT,
  INVOICEGUARD_AGENTKIT_VERSION,
  WORLD_AGENT_SIGNATURE_CHAIN_ID,
  WORLD_AGENT_SIGNATURE_TYPE,
} from './constants.js';

const ACTION_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const NONCE_PATTERN = /^[A-Za-z0-9]{16,64}$/u;
const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MINIMUM_CHALLENGE_TTL_SECONDS = 60;
const MAXIMUM_CHALLENGE_TTL_SECONDS = 120;
const DEFAULT_CHALLENGE_TTL_SECONDS = 90;
const verifiedAgentkitClaimBrand = Symbol('verified-agentkit-claim');
const verifiedAgentkitClaims = new WeakSet<object>();

export type AgentkitApprovalChallenge = Readonly<{
  actionDigest: string;
  agentAddress: `0x${string}`;
  approvalUri: string;
  domain: string;
  expiresAt: string;
  extension: AgentkitExtension;
  issuedAt: string;
  nonce: string;
  organizationId: string;
  statement: typeof INVOICEGUARD_AGENTKIT_STATEMENT;
}>;

export type AgentkitApprovalChallengeValidationResult =
  | Readonly<{
      challenge: AgentkitApprovalChallenge;
      ok: true;
    }>
  | Readonly<{
      ok: false;
    }>;

type VerifiedAgentkitClaimCore = Readonly<{
  actionDigest: string;
  agentAddress: `0x${string}`;
  approvalUri: string;
  challengeId: string;
  expiresAt: string;
  issuedAt: string;
  nonce: string;
  organizationId: string;
  signedProofDigest: string;
}>;
export type VerifiedAgentkitClaim = VerifiedAgentkitClaimCore &
  Readonly<{ [verifiedAgentkitClaimBrand]: true }>;

export type VerifiedAgentkitClaimValidationResult =
  | Readonly<{ claim: VerifiedAgentkitClaim; ok: true }>
  | Readonly<{ ok: false }>;

export type AgentkitRefusalReason =
  | 'CHALLENGE_ALREADY_CONSUMED'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_INVALID'
  | 'CHALLENGE_NOT_YET_VALID'
  | 'COMMIT_FAILED'
  | 'DOMAIN_MISMATCH'
  | 'EXPIRATION_MISMATCH'
  | 'ISSUED_AT_MISMATCH'
  | 'MALFORMED_HEADER'
  | 'METHOD_MISMATCH'
  | 'NONCE_MISMATCH'
  | 'NOT_BEFORE_MISMATCH'
  | 'PATH_DIGEST_MISMATCH'
  | 'REQUEST_BODY_NOT_EMPTY'
  | 'REQUEST_ID_MISMATCH'
  | 'REQUEST_URI_MISMATCH'
  | 'RESOURCE_MISMATCH'
  | 'SDK_VALIDATION_FAILED'
  | 'SIGNATURE_INVALID'
  | 'SIGNATURE_SCHEME_MISMATCH'
  | 'SIGNATURE_TYPE_MISMATCH'
  | 'SIGNER_ADDRESS_MISMATCH'
  | 'STATEMENT_MISMATCH'
  | 'STORED_DIGEST_MISMATCH'
  | 'VERSION_MISMATCH'
  | 'WRONG_SIGNATURE_CHAIN';

export type AgentkitAuthorizationResult =
  | Readonly<{
      claim: VerifiedAgentkitClaim;
      ok: true;
    }>
  | Readonly<{
      ok: false;
      reason: AgentkitRefusalReason;
    }>;

type CreateApprovalChallengeInput = Readonly<{
  actionDigest: string;
  agentAddress: string;
  issuedAt?: Date;
  nonce?: string;
  organizationId: string;
  publicOrigin: string;
  ttlSeconds?: number;
}>;

type AuthorizeAgentkitRequestInput = Readonly<{
  bodyByteLength: number;
  challenge: AgentkitApprovalChallenge;
  header: string;
  method: string;
  now?: Date;
  pathActionDigest: string;
  requestUri: string;
  storedActionDigest: string;
}>;

type AuthorizeAgentkitRequestDependencies = Readonly<{
  commitAuthorization: (claim: VerifiedAgentkitClaimCore) => Promise<unknown>;
  validateMessage?: (
    payload: AgentkitPayload,
    expectedResourceUri: string,
    options: Readonly<{ maxAge: number }>,
  ) => Promise<unknown>;
  verifySignature?: (payload: AgentkitPayload) => Promise<unknown>;
}>;

function requireCanonicalActionDigest(value: string, name: string): string {
  if (!ACTION_DIGEST_PATTERN.test(value)) {
    throw new Error(`${name} must be a lowercase SHA-256 hex digest.`);
  }

  return value;
}

function requireOrganizationId(value: string): string {
  if (!ORGANIZATION_ID_PATTERN.test(value)) {
    throw new Error(
      'organizationId must be one unambiguous URL-safe path segment.',
    );
  }

  return value;
}

function requireAgentAddress(value: string): `0x${string}` {
  if (!isAddress(value, { strict: false })) {
    throw new Error('agentAddress must be a valid EVM address.');
  }

  return getAddress(value);
}

function requirePublicOrigin(value: string): URL {
  const origin = new URL(value);
  const isLocal =
    origin.hostname === 'localhost' ||
    origin.hostname === '127.0.0.1' ||
    origin.hostname === '[::1]';

  if (
    origin.protocol !== 'https:' &&
    !(origin.protocol === 'http:' && isLocal)
  ) {
    throw new Error('publicOrigin must use HTTPS except on localhost.');
  }

  if (
    origin.username !== '' ||
    origin.password !== '' ||
    origin.pathname !== '/' ||
    origin.search !== '' ||
    origin.hash !== ''
  ) {
    throw new Error('publicOrigin must contain only scheme, host, and port.');
  }

  return origin;
}

function requireNonce(value: string): string {
  if (!NONCE_PATTERN.test(value)) {
    throw new Error('nonce must contain 16-64 ASCII letters or digits.');
  }

  return value;
}

function requireTtlSeconds(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < MINIMUM_CHALLENGE_TTL_SECONDS ||
    value > MAXIMUM_CHALLENGE_TTL_SECONDS
  ) {
    throw new Error('ttlSeconds must be an integer from 60 to 120.');
  }

  return value;
}

function requireFiniteDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`${name} must be a valid date.`);
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

function createApprovalUri(
  publicOrigin: URL,
  organizationId: string,
  actionDigest: string,
): URL {
  return new URL(
    `/v1/orgs/${organizationId}/payments/${actionDigest}/decisions/approve`,
    publicOrigin,
  );
}

function hashAgentkitValue(domain: string, value: string): string {
  const hash = createHash('sha256');
  hash.update(domain, 'ascii');
  hash.update(Uint8Array.of(0));
  hash.update(value, 'utf8');
  return hash.digest('hex');
}

function deriveAgentkitChallengeId(
  claim: Pick<
    VerifiedAgentkitClaimCore,
    | 'actionDigest'
    | 'agentAddress'
    | 'approvalUri'
    | 'expiresAt'
    | 'issuedAt'
    | 'nonce'
    | 'organizationId'
  >,
): string {
  return `world-agentkit:${hashAgentkitValue(
    'invoiceguard:world-agentkit-challenge:v1',
    [
      claim.organizationId,
      claim.actionDigest,
      claim.agentAddress,
      claim.approvalUri,
      claim.nonce,
      claim.issuedAt,
      claim.expiresAt,
    ].join('\u0000'),
  )}`;
}

export function validateVerifiedAgentkitClaim(
  value: unknown,
): VerifiedAgentkitClaimValidationResult {
  if (
    !isRecord(value) ||
    !verifiedAgentkitClaims.has(value) ||
    !Object.isFrozen(value)
  ) {
    return Object.freeze({ ok: false });
  }

  const actionDigest = stringField(value, 'actionDigest');
  const agentAddress = stringField(value, 'agentAddress');
  const approvalUri = stringField(value, 'approvalUri');
  const challengeId = stringField(value, 'challengeId');
  const expiresAt = stringField(value, 'expiresAt');
  const issuedAt = stringField(value, 'issuedAt');
  const nonce = stringField(value, 'nonce');
  const organizationId = stringField(value, 'organizationId');
  const signedProofDigest = stringField(value, 'signedProofDigest');

  if (
    Reflect.ownKeys(value).length !== 9 ||
    actionDigest === undefined ||
    agentAddress === undefined ||
    approvalUri === undefined ||
    challengeId === undefined ||
    expiresAt === undefined ||
    issuedAt === undefined ||
    nonce === undefined ||
    organizationId === undefined ||
    signedProofDigest === undefined
  ) {
    return Object.freeze({ ok: false });
  }

  let expectedApprovalUri: string;

  try {
    const parsedApprovalUri = new URL(approvalUri);
    const canonicalDigest = requireCanonicalActionDigest(
      actionDigest,
      'actionDigest',
    );
    const canonicalOrganizationId = requireOrganizationId(organizationId);
    const canonicalAddress = requireAgentAddress(agentAddress);
    const issuedAtDate = requireFiniteDate(new Date(issuedAt), 'issuedAt');
    const expiresAtDate = requireFiniteDate(new Date(expiresAt), 'expiresAt');
    requireNonce(nonce);
    requireTtlSeconds(
      (expiresAtDate.getTime() - issuedAtDate.getTime()) / 1_000,
    );
    expectedApprovalUri = createApprovalUri(
      requirePublicOrigin(parsedApprovalUri.origin),
      canonicalOrganizationId,
      canonicalDigest,
    ).toString();

    if (
      canonicalAddress !== agentAddress ||
      expectedApprovalUri !== approvalUri ||
      issuedAtDate.toISOString() !== issuedAt ||
      expiresAtDate.toISOString() !== expiresAt ||
      !/^[0-9a-f]{64}$/u.test(signedProofDigest) ||
      deriveAgentkitChallengeId({
        actionDigest,
        agentAddress: canonicalAddress,
        approvalUri: expectedApprovalUri,
        expiresAt,
        issuedAt,
        nonce,
        organizationId,
      }) !== challengeId
    ) {
      return Object.freeze({ ok: false });
    }
  } catch {
    return Object.freeze({ ok: false });
  }

  return Object.freeze({ claim: value as VerifiedAgentkitClaim, ok: true });
}

export function generateAgentkitNonce(): string {
  return randomBytes(16).toString('hex');
}

export function createAgentkitApprovalChallenge({
  actionDigest: rawActionDigest,
  agentAddress: rawAgentAddress,
  issuedAt: rawIssuedAt = new Date(),
  nonce: rawNonce = generateAgentkitNonce(),
  organizationId: rawOrganizationId,
  publicOrigin: rawPublicOrigin,
  ttlSeconds: rawTtlSeconds = DEFAULT_CHALLENGE_TTL_SECONDS,
}: CreateApprovalChallengeInput): AgentkitApprovalChallenge {
  const actionDigest = requireCanonicalActionDigest(
    rawActionDigest,
    'actionDigest',
  );
  const agentAddress = requireAgentAddress(rawAgentAddress);
  const organizationId = requireOrganizationId(rawOrganizationId);
  const publicOrigin = requirePublicOrigin(rawPublicOrigin);
  const issuedAt = requireFiniteDate(rawIssuedAt, 'issuedAt');
  const ttlSeconds = requireTtlSeconds(rawTtlSeconds);
  const nonce = requireNonce(rawNonce);
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1_000);
  const approvalUri = createApprovalUri(
    publicOrigin,
    organizationId,
    actionDigest,
  ).toString();

  const extension: AgentkitExtension = {
    info: {
      domain: publicOrigin.hostname,
      uri: approvalUri,
      statement: INVOICEGUARD_AGENTKIT_STATEMENT,
      version: INVOICEGUARD_AGENTKIT_VERSION,
      nonce,
      issuedAt: issuedAt.toISOString(),
      expirationTime: expiresAt.toISOString(),
      resources: [approvalUri],
    },
    supportedChains: [
      {
        chainId: WORLD_AGENT_SIGNATURE_CHAIN_ID,
        type: WORLD_AGENT_SIGNATURE_TYPE,
      },
    ],
    schema: buildAgentkitSchema(),
  };

  Object.freeze(extension.info.resources);
  Object.freeze(extension.info);
  Object.freeze(extension.supportedChains[0]);
  Object.freeze(extension.supportedChains);
  Object.freeze(extension);

  return Object.freeze({
    actionDigest,
    agentAddress,
    approvalUri,
    domain: publicOrigin.hostname,
    expiresAt: expiresAt.toISOString(),
    extension,
    issuedAt: issuedAt.toISOString(),
    nonce,
    organizationId,
    statement: INVOICEGUARD_AGENTKIT_STATEMENT,
  });
}

export function validateAgentkitApprovalChallenge(
  value: unknown,
): AgentkitApprovalChallengeValidationResult {
  let snapshot: unknown;

  try {
    snapshot = structuredClone(value);
  } catch {
    return Object.freeze({ ok: false });
  }

  if (!isRecord(snapshot)) {
    return Object.freeze({ ok: false });
  }

  const actionDigest = stringField(snapshot, 'actionDigest');
  const agentAddress = stringField(snapshot, 'agentAddress');
  const approvalUri = stringField(snapshot, 'approvalUri');
  const domain = stringField(snapshot, 'domain');
  const expiresAt = stringField(snapshot, 'expiresAt');
  const issuedAt = stringField(snapshot, 'issuedAt');
  const nonce = stringField(snapshot, 'nonce');
  const organizationId = stringField(snapshot, 'organizationId');
  const statement = stringField(snapshot, 'statement');

  if (
    actionDigest === undefined ||
    agentAddress === undefined ||
    approvalUri === undefined ||
    domain === undefined ||
    expiresAt === undefined ||
    issuedAt === undefined ||
    nonce === undefined ||
    organizationId === undefined ||
    statement === undefined ||
    !isRecord(snapshot.extension)
  ) {
    return Object.freeze({ ok: false });
  }

  const issuedAtDate = new Date(issuedAt);
  const expiresAtDate = new Date(expiresAt);
  const ttlMilliseconds = expiresAtDate.getTime() - issuedAtDate.getTime();
  const ttlSeconds = ttlMilliseconds / 1_000;
  let approvalUrl: URL;

  try {
    approvalUrl = new URL(approvalUri);
  } catch {
    return Object.freeze({ ok: false });
  }

  if (
    !Number.isInteger(ttlSeconds) ||
    approvalUrl.username !== '' ||
    approvalUrl.password !== '' ||
    approvalUrl.search !== '' ||
    approvalUrl.hash !== ''
  ) {
    return Object.freeze({ ok: false });
  }

  let exactChallenge: AgentkitApprovalChallenge;

  try {
    exactChallenge = createAgentkitApprovalChallenge({
      actionDigest,
      agentAddress,
      issuedAt: issuedAtDate,
      nonce,
      organizationId,
      publicOrigin: approvalUrl.origin,
      ttlSeconds,
    });
  } catch {
    return Object.freeze({ ok: false });
  }

  if (
    exactChallenge.actionDigest !== actionDigest ||
    exactChallenge.agentAddress !== agentAddress ||
    exactChallenge.approvalUri !== approvalUri ||
    exactChallenge.domain !== domain ||
    exactChallenge.expiresAt !== expiresAt ||
    exactChallenge.issuedAt !== issuedAt ||
    exactChallenge.nonce !== nonce ||
    exactChallenge.organizationId !== organizationId ||
    exactChallenge.statement !== statement ||
    !isDeepStrictEqual(exactChallenge.extension, snapshot.extension)
  ) {
    return Object.freeze({ ok: false });
  }

  return Object.freeze({ challenge: exactChallenge, ok: true });
}

export async function signAgentkitApprovalChallenge(
  challenge: AgentkitApprovalChallenge,
  signer: AgentkitSigner,
): Promise<string> {
  const validation = validateAgentkitApprovalChallenge(challenge);

  if (!validation.ok) {
    throw new Error('AgentKit approval challenge is invalid.');
  }

  if (!sameAddress(signer.address, validation.challenge.agentAddress)) {
    throw new Error('signer address does not match the issued challenge.');
  }

  return createAgentkitClient({ signer }).createHeader(
    validation.challenge.extension,
  );
}

function refusal(reason: AgentkitRefusalReason): AgentkitAuthorizationResult {
  return Object.freeze({ ok: false, reason });
}

function parseHeader(header: string): AgentkitPayload | undefined {
  try {
    return parseAgentkitHeader(header);
  } catch {
    return undefined;
  }
}

function hasExactResources(
  resources: readonly string[] | undefined,
  approvalUri: string,
): boolean {
  return (
    resources !== undefined &&
    resources.length === 1 &&
    resources[0] === approvalUri
  );
}

function sameAddress(left: string, right: string): boolean {
  return (
    isAddress(left, { strict: false }) &&
    isAddress(right, { strict: false }) &&
    getAddress(left) === getAddress(right)
  );
}

export async function authorizeAgentkitRequest(
  {
    bodyByteLength,
    challenge,
    header,
    method,
    now: rawNow = new Date(),
    pathActionDigest,
    requestUri,
    storedActionDigest,
  }: AuthorizeAgentkitRequestInput,
  {
    commitAuthorization,
    validateMessage = validateAgentkitMessage,
    verifySignature = verifyAgentkitSignature,
  }: AuthorizeAgentkitRequestDependencies,
): Promise<AgentkitAuthorizationResult> {
  const now = requireFiniteDate(rawNow, 'now');
  const challengeValidation = validateAgentkitApprovalChallenge(challenge);

  if (!challengeValidation.ok) {
    return refusal('CHALLENGE_INVALID');
  }

  const exactChallenge = challengeValidation.challenge;
  const payload = parseHeader(header);

  if (payload === undefined) {
    return refusal('MALFORMED_HEADER');
  }

  if (method !== 'POST') {
    return refusal('METHOD_MISMATCH');
  }

  if (bodyByteLength !== 0) {
    return refusal('REQUEST_BODY_NOT_EMPTY');
  }

  if (requestUri !== exactChallenge.approvalUri) {
    return refusal('REQUEST_URI_MISMATCH');
  }

  if (pathActionDigest !== exactChallenge.actionDigest) {
    return refusal('PATH_DIGEST_MISMATCH');
  }

  if (storedActionDigest !== exactChallenge.actionDigest) {
    return refusal('STORED_DIGEST_MISMATCH');
  }

  if (payload.uri !== exactChallenge.approvalUri) {
    return refusal('REQUEST_URI_MISMATCH');
  }

  if (!hasExactResources(payload.resources, exactChallenge.approvalUri)) {
    return refusal('RESOURCE_MISMATCH');
  }

  if (payload.statement !== exactChallenge.statement) {
    return refusal('STATEMENT_MISMATCH');
  }

  if (payload.domain !== exactChallenge.domain) {
    return refusal('DOMAIN_MISMATCH');
  }

  if (payload.version !== INVOICEGUARD_AGENTKIT_VERSION) {
    return refusal('VERSION_MISMATCH');
  }

  if (payload.chainId !== WORLD_AGENT_SIGNATURE_CHAIN_ID) {
    return refusal('WRONG_SIGNATURE_CHAIN');
  }

  if (payload.type !== WORLD_AGENT_SIGNATURE_TYPE) {
    return refusal('SIGNATURE_TYPE_MISMATCH');
  }

  if (payload.signatureScheme !== undefined) {
    return refusal('SIGNATURE_SCHEME_MISMATCH');
  }

  if (payload.notBefore !== undefined) {
    return refusal('NOT_BEFORE_MISMATCH');
  }

  if (payload.requestId !== undefined) {
    return refusal('REQUEST_ID_MISMATCH');
  }

  if (payload.nonce !== exactChallenge.nonce) {
    return refusal('NONCE_MISMATCH');
  }

  if (payload.issuedAt !== exactChallenge.issuedAt) {
    return refusal('ISSUED_AT_MISMATCH');
  }

  if (payload.expirationTime !== exactChallenge.expiresAt) {
    return refusal('EXPIRATION_MISMATCH');
  }

  if (!sameAddress(payload.address, exactChallenge.agentAddress)) {
    return refusal('SIGNER_ADDRESS_MISMATCH');
  }

  if (now.getTime() < Date.parse(exactChallenge.issuedAt)) {
    return refusal('CHALLENGE_NOT_YET_VALID');
  }

  if (now.getTime() >= Date.parse(exactChallenge.expiresAt)) {
    return refusal('CHALLENGE_EXPIRED');
  }

  let sdkValidation: unknown;

  try {
    sdkValidation = await validateMessage(payload, exactChallenge.approvalUri, {
      maxAge: MAXIMUM_CHALLENGE_TTL_SECONDS * 1_000,
    });
  } catch {
    return refusal('SDK_VALIDATION_FAILED');
  }

  if (!isRecord(sdkValidation) || sdkValidation.valid !== true) {
    return refusal('SDK_VALIDATION_FAILED');
  }

  let signatureVerification: unknown;

  try {
    signatureVerification = await verifySignature(payload);
  } catch {
    return refusal('SIGNATURE_INVALID');
  }

  if (
    !isRecord(signatureVerification) ||
    signatureVerification.valid !== true ||
    typeof signatureVerification.address !== 'string' ||
    !sameAddress(signatureVerification.address, exactChallenge.agentAddress)
  ) {
    return refusal('SIGNATURE_INVALID');
  }

  const claim = Object.freeze({
    actionDigest: exactChallenge.actionDigest,
    agentAddress: exactChallenge.agentAddress,
    approvalUri: exactChallenge.approvalUri,
    challengeId: deriveAgentkitChallengeId({
      actionDigest: exactChallenge.actionDigest,
      agentAddress: exactChallenge.agentAddress,
      approvalUri: exactChallenge.approvalUri,
      expiresAt: exactChallenge.expiresAt,
      issuedAt: exactChallenge.issuedAt,
      nonce: exactChallenge.nonce,
      organizationId: exactChallenge.organizationId,
    }),
    expiresAt: exactChallenge.expiresAt,
    issuedAt: exactChallenge.issuedAt,
    nonce: exactChallenge.nonce,
    organizationId: exactChallenge.organizationId,
    signedProofDigest: hashAgentkitValue(
      'invoiceguard:world-agentkit-signed-header:v1',
      header,
    ),
  });

  try {
    const committed = await commitAuthorization(claim);

    if (committed === false) {
      return refusal('CHALLENGE_ALREADY_CONSUMED');
    }

    if (committed !== true) {
      return refusal('COMMIT_FAILED');
    }
  } catch {
    return refusal('COMMIT_FAILED');
  }

  verifiedAgentkitClaims.add(claim);
  const verifiedClaim = claim as VerifiedAgentkitClaim;
  return Object.freeze({
    claim: verifiedClaim,
    ok: true,
  });
}
