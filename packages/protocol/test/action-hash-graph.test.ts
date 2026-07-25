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
  vectorBlockEvaluation,
  vectorExpected,
  vectorHumanEvaluation,
  vectorStraightThroughEvaluation,
} from './fixtures/payment-action.js';

const vectorMandate = vectorStraightThroughEvaluation.input.mandate;
if (vectorMandate === null) {
  throw new Error('The straight-through vector must include a mandate.');
}

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
      vectorStraightThroughEvaluation,
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
      vectorHumanEvaluation,
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
      vectorHumanEvaluation,
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

  it('rejects a policy evaluation that predates action creation', () => {
    expect(() =>
      createAuthorizationBundle(
        {
          ...vectorActionCore,
          createdAt: '2026-07-25T10:00:02.000Z',
        },
        vectorStraightThroughEvaluation,
      ),
    ).toThrow('policy input action, time window, or policy');
  });

  it('invalidates a final action mutation while retaining the old digest', () => {
    const bundle = createAuthorizationBundle(
      vectorActionCore,
      vectorHumanEvaluation,
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

  it('changes the final digest when a canonical policy input changes', () => {
    const first = createAuthorizationBundle(
      vectorActionCore,
      vectorStraightThroughEvaluation,
    );
    const changedDecision = createPolicyDecision(vectorActionCore, {
      config: vectorStraightThroughEvaluation.config,
      input: {
        ...vectorStraightThroughEvaluation.input,
        fieldsIndependentlyConfirmed: true,
      },
    });
    const changedIntent = createPaymentAuthorizationIntent(
      vectorActionCore,
      changedDecision,
    );
    const changedEnvelope = createPaymentActionEnvelope(changedIntent);

    expect(changedEnvelope.actionDigest).not.toBe(first.envelope.actionDigest);
  });

  it.each([
    {
      label: 'evidence policy',
      mutate: {
        config: vectorStraightThroughEvaluation.config,
        input: {
          ...vectorStraightThroughEvaluation.input,
          mandate: {
            ...vectorMandate,
            evidencePolicy: {
              ...vectorMandate.evidencePolicy,
              digest: '8'.repeat(64),
            },
          },
        },
      },
    },
    {
      label: 'purchase-order result',
      mutate: {
        config: vectorStraightThroughEvaluation.config,
        input: {
          ...vectorStraightThroughEvaluation.input,
          purchaseOrder: {
            mode: 'NOT_REQUIRED' as const,
            result: 'NOT_REQUIRED' as const,
          },
        },
      },
    },
  ])('changes the final digest for a substituted $label', ({ mutate }) => {
    const original = createAuthorizationBundle(
      vectorActionCore,
      vectorStraightThroughEvaluation,
    );
    const changed = createAuthorizationBundle(vectorActionCore, mutate);

    expect(changed.envelope.actionDigest).not.toBe(
      original.envelope.actionDigest,
    );
  });

  it('validates all three frozen policy routes', () => {
    expect(
      createAuthorizationBundle(
        vectorActionCore,
        vectorStraightThroughEvaluation,
      ).decision.route,
    ).toBe('STRAIGHT_THROUGH');
    expect(
      createAuthorizationBundle(vectorActionCore, vectorHumanEvaluation)
        .decision.route,
    ).toBe('HUMAN_APPROVAL');
    expect(
      createAuthorizationBundle(vectorActionCore, vectorBlockEvaluation)
        .decision.route,
    ).toBe('BLOCK');
  });

  it('rejects changed-beneficiary review without required verification', () => {
    expect(
      policyDecisionV1Schema.safeParse({
        ...createPolicyDecision(vectorActionCore, vectorHumanEvaluation),
        verificationMode: 'NOT_REQUIRED',
      }).success,
    ).toBe(false);
  });

  it('rejects an incomplete straight-through policy trace', () => {
    expect(
      policyDecisionV1Schema.safeParse({
        ...createPolicyDecision(
          vectorActionCore,
          vectorStraightThroughEvaluation,
        ),
        reasonCodes: [
          'MANDATE_EXACT_CONTAINMENT',
          'SOURCE_AUTHENTICATED_STRUCTURED',
        ],
      }).success,
    ).toBe(false);
  });

  it('blocks without purchasing evidence when a block reason takes precedence', () => {
    expect(
      policyDecisionV1Schema.safeParse({
        ...createPolicyDecision(vectorActionCore, vectorBlockEvaluation),
        reasonCodes: ['BENEFICIARY_CHANGED', 'DUPLICATE_ALREADY_PAID'],
      }).success,
    ).toBe(true);
  });

  it('rejects unknown action semantics rather than hashing a stripped object', () => {
    expect(
      paymentActionCoreV1Schema.safeParse({
        ...vectorActionCore,
        mutableRecipientOverride: 'hedera:296:0.0.9999',
      }).success,
    ).toBe(false);
  });

  it('does not let callers inject a route or reason trace', () => {
    expect(() =>
      createAuthorizationBundle(vectorActionCore, {
        ...vectorHumanEvaluation,
        route: 'STRAIGHT_THROUGH',
      }),
    ).toThrow();
    expect(() =>
      createAuthorizationBundle(vectorActionCore, {
        ...vectorHumanEvaluation,
        reasonCodes: ['DUPLICATE_CLEAR'],
      }),
    ).toThrow();
  });

  it('rejects a policy-input mutation beneath a frozen decision', () => {
    const bundle = createAuthorizationBundle(
      vectorActionCore,
      vectorStraightThroughEvaluation,
    );

    expect(() =>
      verifyAuthorizationBundle({
        ...bundle,
        policyEvaluation: {
          config: bundle.policyEvaluation.config,
          input: {
            ...bundle.policyEvaluation.input,
            fieldsIndependentlyConfirmed: true,
          },
        },
      }),
    ).toThrow('deterministic evaluation inputs');
  });
});
