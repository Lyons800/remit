import { z } from 'zod';

import {
  isSortedUnique,
  nonEmptyBoundedStringSchema,
  nonNegativeSafeIntegerSchema,
  positiveSafeIntegerSchema,
  schemaVersionV1Schema,
  sha256DigestSchema,
  utcInstantSchema,
  uuidV7Schema,
} from '../primitives.js';
import { verificationModeSchema } from '../invoices/standing-mandate.v1.js';
import { policyReferenceSchema } from './payment-action-core.v1.js';

export const policyRouteSchema = z.enum([
  'STRAIGHT_THROUGH',
  'HUMAN_APPROVAL',
  'BLOCK',
]);

export const policyReasonCodeSchema = z.enum([
  'SOURCE_AUTHENTICATED_STRUCTURED',
  'FIELDS_INDEPENDENTLY_CONFIRMED',
  'SUPPLIER_ACTIVE_EXACT_MATCH',
  'BENEFICIARY_EXACT_MATCH',
  'DUPLICATE_CLEAR',
  'PURCHASE_ORDER_NOT_REQUIRED',
  'PURCHASE_ORDER_EXACT_MATCH',
  'AMOUNT_WITHIN_MANDATE',
  'PERIOD_CAP_AVAILABLE',
  'MANDATE_EXACT_CONTAINMENT',
  'EVIDENCE_NOT_REQUIRED_BY_MANDATE',
  'SOURCE_UNSTRUCTURED',
  'SOURCE_NOT_INDEPENDENTLY_CONFIRMED',
  'EXTRACTION_CONFLICT',
  'SUPPLIER_NEW',
  'SUPPLIER_FIRST_PAYMENT',
  'SUPPLIER_MATCH_INDETERMINATE',
  'BENEFICIARY_CHANGED',
  'BENEFICIARY_MISSING',
  'BENEFICIARY_INDETERMINATE',
  'DUPLICATE_SUSPECTED',
  'PURCHASE_ORDER_MISSING',
  'PURCHASE_ORDER_MISMATCH',
  'AMOUNT_INDETERMINATE',
  'AMOUNT_ABOVE_AUTOMATION_CAP',
  'ASSET_INDETERMINATE',
  'MANDATE_NOT_FOUND',
  'MANDATE_PAUSED',
  'MANDATE_EXPIRED',
  'MANDATE_REVOKED',
  'MANDATE_OUT_OF_SCOPE',
  'MANDATE_PERIOD_CAP_EXCEEDED',
  'EVIDENCE_REQUIRED',
  'POLICY_INPUT_INDETERMINATE',
  'DUPLICATE_ALREADY_PAID',
  'OBLIGATION_ALREADY_SETTLED',
  'SUPPLIER_INACTIVE',
  'SUPPLIER_REVOKED',
  'AMOUNT_INVALID',
  'ASSET_UNSUPPORTED',
  'NETWORK_UNSUPPORTED',
  'MAPPING_POLICY_UNSUPPORTED',
  'POLICY_DISABLED',
]);

const straightThroughReasonCodes = new Set([
  'SOURCE_AUTHENTICATED_STRUCTURED',
  'FIELDS_INDEPENDENTLY_CONFIRMED',
  'SUPPLIER_ACTIVE_EXACT_MATCH',
  'BENEFICIARY_EXACT_MATCH',
  'DUPLICATE_CLEAR',
  'PURCHASE_ORDER_NOT_REQUIRED',
  'PURCHASE_ORDER_EXACT_MATCH',
  'AMOUNT_WITHIN_MANDATE',
  'PERIOD_CAP_AVAILABLE',
  'MANDATE_EXACT_CONTAINMENT',
  'EVIDENCE_NOT_REQUIRED_BY_MANDATE',
]);

const humanReviewReasonCodes = new Set([
  'SOURCE_UNSTRUCTURED',
  'SOURCE_NOT_INDEPENDENTLY_CONFIRMED',
  'EXTRACTION_CONFLICT',
  'SUPPLIER_NEW',
  'SUPPLIER_FIRST_PAYMENT',
  'SUPPLIER_MATCH_INDETERMINATE',
  'BENEFICIARY_CHANGED',
  'BENEFICIARY_MISSING',
  'BENEFICIARY_INDETERMINATE',
  'DUPLICATE_SUSPECTED',
  'PURCHASE_ORDER_MISSING',
  'PURCHASE_ORDER_MISMATCH',
  'AMOUNT_INDETERMINATE',
  'AMOUNT_ABOVE_AUTOMATION_CAP',
  'ASSET_INDETERMINATE',
  'MANDATE_NOT_FOUND',
  'MANDATE_PAUSED',
  'MANDATE_EXPIRED',
  'MANDATE_REVOKED',
  'MANDATE_OUT_OF_SCOPE',
  'MANDATE_PERIOD_CAP_EXCEEDED',
  'EVIDENCE_REQUIRED',
  'POLICY_INPUT_INDETERMINATE',
]);

const blockReasonCodes = new Set([
  'DUPLICATE_ALREADY_PAID',
  'OBLIGATION_ALREADY_SETTLED',
  'SUPPLIER_INACTIVE',
  'SUPPLIER_REVOKED',
  'AMOUNT_INVALID',
  'ASSET_UNSUPPORTED',
  'NETWORK_UNSUPPORTED',
  'MAPPING_POLICY_UNSUPPORTED',
  'POLICY_DISABLED',
]);

const authorityRequirementsSchema = z
  .object({
    actionHumanQuorum: nonNegativeSafeIntegerSchema.max(255),
    agentBookQuorum: nonNegativeSafeIntegerSchema.max(255),
    companySubjectQuorum: nonNegativeSafeIntegerSchema.max(255),
    roles: z
      .array(
        z
          .object({
            count: positiveSafeIntegerSchema.max(255),
            role: nonEmptyBoundedStringSchema,
          })
          .strict(),
      )
      .max(255),
  })
  .strict()
  .superRefine(({ roles }, context) => {
    if (!isSortedUnique(roles.map(({ role }) => role))) {
      context.addIssue({
        code: 'custom',
        message: 'role requirements must be sorted and unique',
        path: ['roles'],
      });
    }
  });

export const policyDecisionV1Schema = z
  .object({
    actionCoreDigest: sha256DigestSchema,
    evidencePolicy: z
      .object({
        digest: sha256DigestSchema,
        id: nonEmptyBoundedStringSchema,
        version: positiveSafeIntegerSchema,
      })
      .strict(),
    evaluatedAt: utcInstantSchema,
    expiresAt: utcInstantSchema,
    inputRoot: sha256DigestSchema,
    policy: policyReferenceSchema,
    purchaseOrder: z
      .object({
        mode: z.enum([
          'NOT_REQUIRED',
          'EXACT_REFERENCE',
          'EXACT_REFERENCE_AND_TOTAL',
        ]),
        result: z.enum([
          'NOT_REQUIRED',
          'EXACT_REFERENCE_MATCH',
          'EXACT_REFERENCE_AND_TOTAL_MATCH',
          'MISMATCH',
          'UNKNOWN',
        ]),
      })
      .strict(),
    reasonCodes: z.array(policyReasonCodeSchema).min(1).max(64),
    requiredAuthority: authorityRequirementsSchema,
    route: policyRouteSchema,
    schemaVersion: schemaVersionV1Schema,
    standingMandate: z
      .object({
        mandateDigest: sha256DigestSchema,
        mandateId: uuidV7Schema,
        mandateVersion: positiveSafeIntegerSchema,
      })
      .strict()
      .nullable(),
    verificationMode: verificationModeSchema,
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.evaluatedAt >= decision.expiresAt) {
      context.addIssue({
        code: 'custom',
        message: 'decision expiry must follow evaluation',
        path: ['expiresAt'],
      });
    }

    if (!isSortedUnique(decision.reasonCodes)) {
      context.addIssue({
        code: 'custom',
        message: 'policy reasons must be sorted and unique',
        path: ['reasonCodes'],
      });
    }

    const hasHumanReviewReason = decision.reasonCodes.some((code) =>
      humanReviewReasonCodes.has(code),
    );
    const hasBlockReason = decision.reasonCodes.some((code) =>
      blockReasonCodes.has(code),
    );
    const totalRoleSlots = decision.requiredAuthority.roles.reduce(
      (sum, { count }) => sum + count,
      0,
    );
    const quorums = [
      decision.requiredAuthority.actionHumanQuorum,
      decision.requiredAuthority.agentBookQuorum,
      decision.requiredAuthority.companySubjectQuorum,
    ];
    const purchaseOrderSatisfied =
      (decision.purchaseOrder.mode === 'NOT_REQUIRED' &&
        decision.purchaseOrder.result === 'NOT_REQUIRED') ||
      (decision.purchaseOrder.mode === 'EXACT_REFERENCE' &&
        decision.purchaseOrder.result === 'EXACT_REFERENCE_MATCH') ||
      (decision.purchaseOrder.mode === 'EXACT_REFERENCE_AND_TOTAL' &&
        decision.purchaseOrder.result === 'EXACT_REFERENCE_AND_TOTAL_MATCH');

    if (decision.route === 'STRAIGHT_THROUGH') {
      const confirmedSource = decision.reasonCodes.some(
        (code) =>
          code === 'SOURCE_AUTHENTICATED_STRUCTURED' ||
          code === 'FIELDS_INDEPENDENTLY_CONFIRMED',
      );
      const purchaseOrderReasonSatisfied =
        (decision.purchaseOrder.mode === 'NOT_REQUIRED' &&
          decision.reasonCodes.includes('PURCHASE_ORDER_NOT_REQUIRED') &&
          !decision.reasonCodes.includes('PURCHASE_ORDER_EXACT_MATCH')) ||
        (decision.purchaseOrder.mode !== 'NOT_REQUIRED' &&
          !decision.reasonCodes.includes('PURCHASE_ORDER_NOT_REQUIRED') &&
          decision.reasonCodes.includes('PURCHASE_ORDER_EXACT_MATCH'));
      const requiredReasons = [
        'SUPPLIER_ACTIVE_EXACT_MATCH',
        'BENEFICIARY_EXACT_MATCH',
        'DUPLICATE_CLEAR',
        'AMOUNT_WITHIN_MANDATE',
        'PERIOD_CAP_AVAILABLE',
        'MANDATE_EXACT_CONTAINMENT',
      ] as const;
      if (
        decision.standingMandate === null ||
        quorums.some((quorum) => quorum !== 0) ||
        totalRoleSlots !== 0 ||
        hasHumanReviewReason ||
        hasBlockReason ||
        !confirmedSource ||
        !purchaseOrderReasonSatisfied ||
        !purchaseOrderSatisfied ||
        requiredReasons.some(
          (reason) => !decision.reasonCodes.includes(reason),
        ) ||
        (decision.verificationMode === 'NOT_REQUIRED') !==
          decision.reasonCodes.includes('EVIDENCE_NOT_REQUIRED_BY_MANDATE')
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'straight-through requires exact mandate containment, confirmed source, and zero action approvals',
        });
      }
    }

    if (decision.route === 'HUMAN_APPROVAL') {
      if (
        hasBlockReason ||
        !hasHumanReviewReason ||
        totalRoleSlots === 0 ||
        quorums.some((quorum) => quorum !== totalRoleSlots) ||
        (decision.verificationMode === 'REQUIRED') !==
          decision.reasonCodes.includes('EVIDENCE_REQUIRED')
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'human approval requires review reasons and equal role, subject, agent, and human quorums',
        });
      }
    }

    if (decision.route === 'BLOCK') {
      if (
        !hasBlockReason ||
        quorums.some((quorum) => quorum !== 0) ||
        totalRoleSlots !== 0 ||
        decision.verificationMode !== 'NOT_REQUIRED'
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'blocked decisions require a block reason and cannot trigger approvals or evidence purchase',
        });
      }
    }

    if (
      decision.route === 'HUMAN_APPROVAL' &&
      decision.reasonCodes.includes('BENEFICIARY_CHANGED') &&
      decision.verificationMode !== 'REQUIRED'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'a changed beneficiary requires verification in policy v1',
        path: ['verificationMode'],
      });
    }

    for (const reasonCode of decision.reasonCodes) {
      if (
        !straightThroughReasonCodes.has(reasonCode) &&
        !humanReviewReasonCodes.has(reasonCode) &&
        !blockReasonCodes.has(reasonCode)
      ) {
        context.addIssue({
          code: 'custom',
          message: `unclassified policy reason: ${reasonCode}`,
          path: ['reasonCodes'],
        });
      }
    }
  });

export type PolicyDecisionV1 = z.infer<typeof policyDecisionV1Schema>;
export type PolicyReasonCode = z.infer<typeof policyReasonCodeSchema>;
export type PolicyRoute = z.infer<typeof policyRouteSchema>;
