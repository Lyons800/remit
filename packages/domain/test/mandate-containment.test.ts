import { createAuthorizationBundle } from '@remit/protocol/hashing';
import { describe, expect, it } from 'vitest';

import { validateMandateContainment } from '../src/index.js';
import {
  ACTION_EXPIRES_AT,
  NOW,
  actionCore,
  activeMandateAggregate,
  authorization,
  policyEvaluation,
  policyEvaluationForCore,
} from './fixtures/authorization.js';

const evaluatedMandate = policyEvaluation.input.mandate;
if (evaluatedMandate === null) {
  throw new Error('The straight-through fixture must include a mandate.');
}

describe('exact standing-mandate containment', () => {
  it('accepts the verified action, decision, mandate, and period exactly', () => {
    expect(
      validateMandateContainment(authorization, activeMandateAggregate, NOW),
    ).toEqual({
      ok: true,
      value: {
        actionDigest: authorization.envelope.actionDigest,
        mandateDigest: activeMandateAggregate.record.mandateDigest,
        mandateId: activeMandateAggregate.record.mandateId,
        mandateVersion: activeMandateAggregate.record.mandateVersion,
        periodCapAtoms: '20000000',
        periodKey: 'UTC_MONTH:2026-07',
        settlementAmountAtoms: '2500000',
      },
    });
  });

  it('recomputes the authorization bundle before containment', () => {
    expect(
      validateMandateContainment(
        {
          ...authorization,
          actionCore: {
            ...authorization.actionCore,
            supplierSnapshotDigest: '7'.repeat(64),
          },
        },
        activeMandateAggregate,
        NOW,
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_CONTAINMENT_FAILED' },
      ok: false,
    });
  });

  it('rejects a re-signed supplier snapshot substitution', () => {
    const changedCore = {
      ...actionCore,
      supplierSnapshotDigest: '7'.repeat(64),
    };
    const changed = createAuthorizationBundle(
      changedCore,
      policyEvaluationForCore(changedCore),
    );

    expect(
      validateMandateContainment(changed, activeMandateAggregate, NOW),
    ).toMatchObject({
      error: { code: 'MANDATE_CONTAINMENT_FAILED' },
      ok: false,
    });
  });

  it('rejects re-signed evidence-policy and purchase-order substitutions', () => {
    const evidenceChanged = createAuthorizationBundle(actionCore, {
      config: policyEvaluation.config,
      input: {
        ...policyEvaluation.input,
        mandate: {
          ...evaluatedMandate,
          evidencePolicy: {
            ...evaluatedMandate.evidencePolicy,
            digest: '7'.repeat(64),
          },
        },
      },
    });
    expect(
      validateMandateContainment(evidenceChanged, activeMandateAggregate, NOW),
    ).toMatchObject({
      error: { code: 'MANDATE_CONTAINMENT_FAILED' },
      ok: false,
    });

    const purchaseOrderChanged = createAuthorizationBundle(actionCore, {
      config: policyEvaluation.config,
      input: {
        ...policyEvaluation.input,
        purchaseOrder: {
          mode: 'EXACT_REFERENCE',
          result: 'EXACT_REFERENCE_MATCH',
        },
      },
    });
    expect(
      validateMandateContainment(
        purchaseOrderChanged,
        activeMandateAggregate,
        NOW,
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_CONTAINMENT_FAILED' },
      ok: false,
    });
  });

  it('rejects mutation of the verified mandate and non-active state', () => {
    expect(
      validateMandateContainment(
        authorization,
        {
          ...activeMandateAggregate,
          record: {
            ...activeMandateAggregate.record,
            settlementBeneficiary: 'hedera:296:0.0.2000',
          },
        },
        NOW,
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_CONTAINMENT_FAILED' },
      ok: false,
    });

    expect(
      validateMandateContainment(
        authorization,
        { ...activeMandateAggregate, state: 'PAUSED' },
        NOW,
      ),
    ).toMatchObject({
      error: { code: 'MANDATE_NOT_ACTIVE' },
      ok: false,
    });
  });

  it('uses the frozen action expiry instead of a caller extension', () => {
    expect(
      validateMandateContainment(
        authorization,
        activeMandateAggregate,
        ACTION_EXPIRES_AT,
      ),
    ).toMatchObject({
      error: { code: 'ACTION_EXPIRED' },
      ok: false,
    });
  });

  it('refuses authorization before the frozen policy evaluation time', () => {
    const futureDecision = createAuthorizationBundle(actionCore, {
      config: policyEvaluation.config,
      input: {
        ...policyEvaluation.input,
        evaluatedAt: '2026-07-25T10:30:00.000Z',
      },
    });

    expect(
      validateMandateContainment(futureDecision, activeMandateAggregate, NOW),
    ).toMatchObject({
      error: { code: 'ACTION_TIME_INVALID' },
      ok: false,
    });
  });

  it('does not admit an action created before the mandate became effective', () => {
    const oldCore = {
      ...actionCore,
      createdAt: '2026-06-30T23:59:59.999Z',
    };
    const oldAction = createAuthorizationBundle(
      oldCore,
      policyEvaluationForCore(oldCore),
    );

    expect(
      validateMandateContainment(oldAction, activeMandateAggregate, NOW),
    ).toMatchObject({
      error: { code: 'MANDATE_CONTAINMENT_FAILED' },
      ok: false,
    });
  });
});
