import type {
  PolicyDecisionV1,
  StandingMandateV1,
} from '@invoiceguard/protocol';
import type { AuthorizationBundleV1 } from '@invoiceguard/protocol/hashing';

export type EvidencePolicyReference = PolicyDecisionV1['evidencePolicy'];
export type MandatePeriodKind = StandingMandateV1['period']['kind'];
export type PurchaseOrderPolicyMode = PolicyDecisionV1['purchaseOrder']['mode'];
export type PurchaseOrderPolicyResult =
  PolicyDecisionV1['purchaseOrder']['result'];
export type StandingMandateReference = NonNullable<
  PolicyDecisionV1['standingMandate']
>;

export type PaymentAuthorizationContext = AuthorizationBundleV1;

export type StandingMandateAggregate = Readonly<{
  record: StandingMandateV1;
  state: 'ISSUED' | 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'EXPIRED';
}>;
