import { accept, refuse, type DomainResult } from '../result.js';

export type PaymentHistoryFacts = Readonly<{
  nonTerminalActionCountForObligation: number;
  settlementCountForAction: number;
  settlementCountForObligation: number;
}>;

function isValidCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validatePaymentHistory(
  facts: PaymentHistoryFacts,
): DomainResult<PaymentHistoryFacts> {
  if (
    !isValidCount(facts.nonTerminalActionCountForObligation) ||
    !isValidCount(facts.settlementCountForAction) ||
    !isValidCount(facts.settlementCountForObligation) ||
    facts.settlementCountForAction > facts.settlementCountForObligation
  ) {
    return refuse('PAYMENT_HISTORY_INVALID');
  }

  if (facts.settlementCountForAction > 1) {
    return refuse('ACTION_ALREADY_CONSUMED');
  }

  if (facts.settlementCountForObligation > 1) {
    return refuse('OBLIGATION_ALREADY_SETTLED');
  }

  if (facts.nonTerminalActionCountForObligation > 1) {
    return refuse('OBLIGATION_ACTION_CONFLICT');
  }

  return accept(facts);
}

export function validateNewPaymentActionEligibility(
  facts: PaymentHistoryFacts,
): DomainResult<PaymentHistoryFacts> {
  const history = validatePaymentHistory(facts);
  if (!history.ok) {
    return history;
  }

  if (facts.settlementCountForObligation !== 0) {
    return refuse('OBLIGATION_ALREADY_SETTLED');
  }

  if (facts.nonTerminalActionCountForObligation !== 0) {
    return refuse('OBLIGATION_ACTION_CONFLICT');
  }

  return accept(facts);
}

export function validateSettlementClaim(
  facts: PaymentHistoryFacts,
): DomainResult<PaymentHistoryFacts> {
  const history = validatePaymentHistory(facts);
  if (!history.ok) {
    return history;
  }

  if (facts.settlementCountForAction !== 0) {
    return refuse('ACTION_ALREADY_CONSUMED');
  }

  if (facts.settlementCountForObligation !== 0) {
    return refuse('OBLIGATION_ALREADY_SETTLED');
  }

  return accept(facts);
}

export type DigestBinding = Readonly<{
  actionDigest: string;
  source: string;
}>;

export function validateDigestBindings(
  expectedActionDigest: string,
  bindings: readonly DigestBinding[],
): DomainResult<readonly DigestBinding[]> {
  return bindings.every(
    ({ actionDigest }) => actionDigest === expectedActionDigest,
  )
    ? accept(bindings)
    : refuse('ACTION_DIGEST_MISMATCH');
}
