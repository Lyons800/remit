import { canonicalizeJson } from './canonical-json.js';
import { digestCanonicalValue, digestDomains } from './digest.js';
import {
  paymentActionCoreV1Schema,
  type PaymentActionCoreV1,
} from './actions/payment-action-core.v1.js';
import {
  paymentActionEnvelopeV1Schema,
  paymentAuthorizationIntentV1Schema,
  type PaymentActionEnvelopeV1,
  type PaymentAuthorizationIntentV1,
} from './actions/payment-authorization-intent.v1.js';
import {
  policyDecisionV1Schema,
  type PolicyDecisionV1,
} from './actions/policy-decision.v1.js';
import type { Sha256Digest } from './primitives.js';

export type PolicyDecisionInputV1 = Omit<PolicyDecisionV1, 'actionCoreDigest'>;

export type AuthorizationBundleV1 = Readonly<{
  actionCore: PaymentActionCoreV1;
  decision: PolicyDecisionV1;
  envelope: PaymentActionEnvelopeV1;
}>;

function bindingError(message: string): Error {
  return new Error(`Protocol binding mismatch: ${message}.`);
}

export function hashPaymentActionCore(core: unknown): Sha256Digest {
  return digestCanonicalValue(
    digestDomains.paymentActionCore,
    paymentActionCoreV1Schema,
    core,
  );
}

export function hashPolicyDecision(decision: unknown): Sha256Digest {
  return digestCanonicalValue(
    digestDomains.policyDecision,
    policyDecisionV1Schema,
    decision,
  );
}

export function hashPaymentAuthorizationIntent(intent: unknown): Sha256Digest {
  return digestCanonicalValue(
    digestDomains.paymentAction,
    paymentAuthorizationIntentV1Schema,
    intent,
  );
}

export function createPolicyDecision(
  actionCore: unknown,
  input: PolicyDecisionInputV1,
): PolicyDecisionV1 {
  const core = paymentActionCoreV1Schema.parse(actionCore);
  const decision = policyDecisionV1Schema.parse({
    ...input,
    actionCoreDigest: hashPaymentActionCore(core),
  });

  if (
    canonicalizeJson(decision.policy) !== canonicalizeJson(core.policy) ||
    decision.expiresAt !== core.expiresAt ||
    decision.evaluatedAt < core.createdAt
  ) {
    throw bindingError(
      'policy identity, expiry, or evaluation chronology differs from action core',
    );
  }

  return decision;
}

export function createPaymentAuthorizationIntent(
  actionCore: unknown,
  decisionInput: unknown,
): PaymentAuthorizationIntentV1 {
  const core = paymentActionCoreV1Schema.parse(actionCore);
  const decision = policyDecisionV1Schema.parse(decisionInput);

  if (hashPaymentActionCore(core) !== decision.actionCoreDigest) {
    throw bindingError('policy decision references another action core');
  }

  if (
    canonicalizeJson(decision.policy) !== canonicalizeJson(core.policy) ||
    decision.expiresAt !== core.expiresAt ||
    decision.evaluatedAt < core.createdAt
  ) {
    throw bindingError(
      'policy identity, expiry, or evaluation chronology differs from action core',
    );
  }

  return paymentAuthorizationIntentV1Schema.parse({
    ...core,
    policyDecisionDigest: hashPolicyDecision(decision),
  });
}

export function createPaymentActionEnvelope(
  intent: unknown,
): PaymentActionEnvelopeV1 {
  const action = paymentAuthorizationIntentV1Schema.parse(intent);
  return paymentActionEnvelopeV1Schema.parse({
    action,
    actionDigest: hashPaymentAuthorizationIntent(action),
  });
}

export function createAuthorizationBundle(
  actionCoreInput: unknown,
  decisionInput: PolicyDecisionInputV1,
): AuthorizationBundleV1 {
  const actionCore = paymentActionCoreV1Schema.parse(actionCoreInput);
  const decision = createPolicyDecision(actionCore, decisionInput);
  const action = createPaymentAuthorizationIntent(actionCore, decision);
  const envelope = createPaymentActionEnvelope(action);
  return Object.freeze({ actionCore, decision, envelope });
}

export function verifyAuthorizationBundle(
  bundleInput: AuthorizationBundleV1,
): AuthorizationBundleV1 {
  const actionCore = paymentActionCoreV1Schema.parse(bundleInput.actionCore);
  const decision = policyDecisionV1Schema.parse(bundleInput.decision);
  const envelope = paymentActionEnvelopeV1Schema.parse(bundleInput.envelope);
  const expectedIntent = createPaymentAuthorizationIntent(actionCore, decision);

  if (canonicalizeJson(expectedIntent) !== canonicalizeJson(envelope.action)) {
    throw bindingError('final action differs from the bound core and decision');
  }

  if (
    hashPaymentAuthorizationIntent(envelope.action) !== envelope.actionDigest
  ) {
    throw bindingError('final action digest does not recompute');
  }

  return Object.freeze({ actionCore, decision, envelope });
}
