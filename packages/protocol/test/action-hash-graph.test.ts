import { describe, expect, it } from 'vitest';

import {
  paymentActionCoreV1Schema,
  policyDecisionV1Schema,
} from '../src/index.js';
import {
  canonicalizeJson,
  createAuthorizationBundle,
  createPaymentActionEnvelope,
  createPaymentAuthorizationIntent,
  createPolicyDecision,
  hashPaymentActionCore,
  hashPaymentAuthorizationIntent,
  hashPolicyDecision,
  verifyAuthorizationBundle,
} from '../src/hashing.js';
import {
  vectorActionCore,
  vectorBlockDecision,
  vectorExpected,
  vectorHumanDecision,
  vectorStraightThroughDecision,
} from './fixtures/payment-action.js';

describe('RFC 8785 canonical JSON', () => {
  it('sorts object properties recursively and preserves array order', () => {
    expect(
      canonicalizeJson({
        z: [3, 2, 1],
        nested: { z: null, a: true },
        b: 2,
        a: 'one',
      }),
    ).toBe('{"a":"one","b":2,"nested":{"a":true,"z":null},"z":[3,2,1]}');
  });

  it('rejects non-I-JSON values', () => {
    expect(() => canonicalizeJson(Number.NaN)).toThrow('finite numbers');
    expect(() => canonicalizeJson('\ud800')).toThrow('lone surrogate');
    expect(() => canonicalizeJson(new Date())).toThrow('plain JSON object');
  });
});

describe('non-circular payment authorization hash graph', () => {
  it('matches the committed v1 vector', () => {
    const bundle = createAuthorizationBundle(
      vectorActionCore,
      vectorStraightThroughDecision,
    );

    expect(hashPaymentActionCore(bundle.actionCore)).toBe(
      vectorExpected.actionCoreDigest,
    );
    expect(hashPolicyDecision(bundle.decision)).toBe(
      vectorExpected.policyDecisionDigest,
    );
    expect(bundle.envelope.actionDigest).toBe(vectorExpected.actionDigest);
  });

  it('binds core, decision, and final intent without circular fields', () => {
    const bundle = createAuthorizationBundle(
      vectorActionCore,
      vectorHumanDecision,
    );

    expect(bundle.decision).not.toHaveProperty('actionDigest');
    expect(bundle.envelope.action).not.toHaveProperty('actionDigest');
    expect(bundle.decision.actionCoreDigest).toBe(
      hashPaymentActionCore(bundle.actionCore),
    );
    expect(bundle.envelope.action.policyDecisionDigest).toBe(
      hashPolicyDecision(bundle.decision),
    );
    expect(bundle.envelope.actionDigest).toBe(
      hashPaymentAuthorizationIntent(bundle.envelope.action),
    );
    expect(verifyAuthorizationBundle(bundle)).toEqual(bundle);
  });

  it('rejects a policy decision copied to another action core', () => {
    const decision = createPolicyDecision(
      vectorActionCore,
      vectorHumanDecision,
    );
    const changedCore = {
      ...vectorActionCore,
      settlement: {
        ...vectorActionCore.settlement,
        beneficiary: 'hedera:296:0.0.1001',
      },
    };

    expect(() =>
      createPaymentAuthorizationIntent(changedCore, decision),
    ).toThrow('another action core');
  });

  it('invalidates a final action mutation while retaining the old digest', () => {
    const bundle = createAuthorizationBundle(
      vectorActionCore,
      vectorHumanDecision,
    );
    const changedAction = {
      ...bundle.envelope.action,
      settlement: {
        ...bundle.envelope.action.settlement,
        amountAtoms: '2500001',
      },
    };

    expect(hashPaymentAuthorizationIntent(changedAction)).not.toBe(
      bundle.envelope.actionDigest,
    );
    expect(() =>
      verifyAuthorizationBundle({
        ...bundle,
        envelope: {
          action: changedAction,
          actionDigest: bundle.envelope.actionDigest,
        },
      }),
    ).toThrow('final action differs');
  });

  it('changes the final digest when a compatible policy reason changes', () => {
    const first = createAuthorizationBundle(
      vectorActionCore,
      vectorStraightThroughDecision,
    );
    const changedDecision = createPolicyDecision(vectorActionCore, {
      ...vectorStraightThroughDecision,
      reasonCodes: [
        'AMOUNT_WITHIN_MANDATE',
        'BENEFICIARY_EXACT_MATCH',
        'DUPLICATE_CLEAR',
        'EVIDENCE_NOT_REQUIRED_BY_MANDATE',
        'FIELDS_INDEPENDENTLY_CONFIRMED',
        'MANDATE_EXACT_CONTAINMENT',
        'PERIOD_CAP_AVAILABLE',
        'PURCHASE_ORDER_EXACT_MATCH',
        'SOURCE_AUTHENTICATED_STRUCTURED',
        'SUPPLIER_ACTIVE_EXACT_MATCH',
      ],
    });
    const changedIntent = createPaymentAuthorizationIntent(
      vectorActionCore,
      changedDecision,
    );
    const changedEnvelope = createPaymentActionEnvelope(changedIntent);

    expect(changedEnvelope.actionDigest).not.toBe(first.envelope.actionDigest);
  });

  it('validates all three frozen policy routes', () => {
    expect(
      createAuthorizationBundle(vectorActionCore, vectorStraightThroughDecision)
        .decision.route,
    ).toBe('STRAIGHT_THROUGH');
    expect(
      createAuthorizationBundle(vectorActionCore, vectorHumanDecision).decision
        .route,
    ).toBe('HUMAN_APPROVAL');
    expect(
      createAuthorizationBundle(vectorActionCore, vectorBlockDecision).decision
        .route,
    ).toBe('BLOCK');
  });

  it('rejects changed-beneficiary review without required verification', () => {
    expect(
      policyDecisionV1Schema.safeParse({
        ...createPolicyDecision(vectorActionCore, vectorHumanDecision),
        verificationMode: 'NOT_REQUIRED',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown action semantics rather than hashing a stripped object', () => {
    expect(
      paymentActionCoreV1Schema.safeParse({
        ...vectorActionCore,
        mutableRecipientOverride: 'hedera:296:0.0.9999',
      }).success,
    ).toBe(false);
  });
});
