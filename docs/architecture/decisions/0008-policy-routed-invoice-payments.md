# ADR 0008: Policy-routed invoice payments

- Status: accepted
- Date: 2026-07-25

## Context

Accounts payable is a volume problem. Requiring a fresh human decision for every
known recurring invoice preserves control but fails to remove the operational
work Remit is meant to solve. Allowing a model or payment agent to decide which
invoices need review would make extraction output an authority source.

Invoice ingestion also introduces records that must not be confused: a source
document, a normalized invoice, a supplier-master snapshot, and a payment action
have different provenance and mutation rules.

## Decision

Keep three independent lifecycles:

1. immutable source observations and extraction provenance;
2. versioned canonical invoice records reconciled against immutable supplier and
   purchase-order snapshots; and
3. one-use payment actions under ADR 0002.

A pure deterministic policy routes each frozen action to exactly one outcome:

- `STRAIGHT_THROUGH`;
- `HUMAN_APPROVAL`; or
- `BLOCK`.

The same policy sets `verificationMode` to exactly `NOT_REQUIRED` or `REQUIRED`.
`REQUIRED` makes the paid evidence result a settlement precondition.
`NOT_REQUIRED` is an explicit, digest-bound policy decision; it is not a
network-error fallback. The material changed-beneficiary fixture requires
verification, while a routine mandate may omit it when the mandate version says
so.

`STRAIGHT_THROUGH` may set the per-invoice human quorum to zero only when every
field is contained by an unexpired, unrevoked standing mandate. The mandate
fixes supplier, supplier snapshot, source beneficiary, source asset and cap,
settlement network, asset and beneficiary, mapping-policy hash, settlement
invoice and period caps, an explicit authenticated-structured-only or
authenticated-or-independently-confirmed source requirement, evidence
requirements, purchase-order policy, validity, and version. It is issued through
a separate company-governance flow and cannot be created or broadened by an
invoice or payment agent.

Email, upload, and model-extracted fields remain untrusted candidate data.
Unstructured extraction alone cannot enter the straight-through lane.
Indeterminate source, duplicate, supplier, beneficiary, amount, asset, evidence,
mandate, or policy state routes to human review or block according to the frozen
policy.

`HUMAN_APPROVAL` uses the company-role, AgentKit, and World Human-in-the-Loop
facts in ADRs 0003 and 0007. `BLOCK` has no override on the existing action; a
corrected input creates a new invoice revision and action.

All routes retain exact-action hashing, current agent authority, the frozen
verification mode, signing guard, one-use settlement, crash recovery, and
reconciliation. Approving one payment never updates the supplier master.

## Consequences

- Finance teams can automate bounded recurring payments without hiding the
  governing authority.
- Policy traces and reason codes, not model scores, explain every route.
- Ingestion and extraction can scale independently without receiving financial
  keys.
- The domain needs separate invoice, mandate, and payment-action state machines.
- The demo can show operational scale while concentrating live sponsor evidence
  on one material exception.
- A production bank or stablecoin rail remains a separate reviewed adapter. The
  hackathon UI must not represent a Hedera Testnet effect as a EUR bank payment.

## Rejected alternatives

- Human approval on every invoice: preserves safety but does not solve the
  operating-volume problem.
- Model confidence as auto-pay authority: probabilistic and vulnerable to
  malformed or adversarial documents.
- One mutable invoice/payment record: permits extraction or correction to alter
  an approved action.
- Treating an approved exception as a supplier-master update: converts one
  narrow decision into permanent authority.
- A separate microservice for each source connector: adds operational ceremony
  without changing a trust boundary.
