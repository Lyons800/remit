# Product brief

## Product

InvoiceGuard is an agentic accounts-payable operations system with an
exact-action control plane. It gives finance teams one place to receive, check,
approve, pay, and reconcile supplier invoices.

Agents do the repetitive work. Deterministic policy decides what is eligible for
a standing mandate. People review only the material exceptions.

## Why this is being built

Paying even ten suppliers at our Lisbon padel club already means collecting
invoices from different places, retyping payment details into awkward bank
screens, checking who approved what, and chasing the next person. The work is
slow, fragmented, and easy to get wrong.

The same problem compounds inside a larger company. Instead of ten invoices,
accounts payable may need to process hundreds or thousands. Adding autonomous
agents can remove the repetitive work, but only if the company can constrain
what those agents may pay and escalate the right exceptions.

## First buyer and users

- Initial buyer: a finance manager or owner at a multi-site club, hospitality
  group, or growing company with recurring suppliers.
- Expansion buyer: an enterprise accounts-payable, controller, or treasury team
  operating at higher invoice volume.
- Finance operator: manages the invoice queue and investigates exceptions.
- Invoice agent: extracts candidate fields, reconciles records, and proposes
  payment actions.
- Payment agent: executes only actions admitted by a current mandate or
  exception policy.
- Approval delegate: holds a company role and reviews an exact exception on
  desktop or mobile.
- Auditor: inspects why value did or did not move and whether it reconciled.

## Invoice intake

The canonical boundary is an idempotent organization-scoped API:

```text
POST /v1/orgs/{organizationId}/invoices
Idempotency-Key: <source-stable-key>

sourceType
sourceDocumentId
document or immutable object reference
sourceMetadata
```

It returns `202 Accepted` with an immutable `observationId` and `received`
state. Normalization later creates or attaches an invoice revision. The product
uses the same acceptance boundary for:

- drag-and-drop PDF or image upload;
- structured procurement, ERP, vendor-portal, or accounting calls;
- a shared supplier-invoice address through an email adapter; and
- later e-invoice and accounting connectors.

Every source is untrusted. A model may extract supplier name and tax identifier,
invoice number, dates, currency, amount, beneficiary, purchase-order reference,
and other candidate fields. It cannot approve, edit the vendor master, or create
a financial effect.

## Three separate records

InvoiceGuard does not turn an uploaded document directly into a payment:

1. **Source observation:** immutable document bytes or object reference, source
   metadata, content hash, and extraction provenance.
2. **Invoice record:** normalized candidate fields, supplier and purchase-order
   matches, duplicate evidence, validation outcomes, and operator corrections.
3. **Payment action:** the source invoice digest and amount plus the final
   settlement recipient, asset, integer amount, network, deterministic mapping,
   evidence root, exact policy-decision digest, expiry, and nonce frozen under
   one digest.

A changed field creates a new action. Approving one exceptional payment never
updates the approved supplier record.

## Policy lanes

| Lane             | Typical conditions                                                                                                                                      | Authority                                                                                                                                 | Outcome                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Straight-through | Known supplier and beneficiary, authenticated structured source or independently confirmed fields, non-duplicate, expected amount/currency, within caps | Current company-enrolled AgentKit-backed payment agent plus an unexpired, pre-approved standing mandate for the exact boundaries          | Schedule and execute without per-invoice HITL |
| Review           | New supplier, changed beneficiary, unusual amount, first payment, missing evidence, cap breach, or configured high-value threshold                      | Configured evidence when the frozen policy says `REQUIRED`, plus the fresh World-bound company-role approvals specified for the exception | Hold until the exact exception reaches quorum |
| Blocked          | Duplicate, `MISMATCH`, `UNKNOWN`, unavailable required evidence, altered action, expired/revoked authority, or replay                                   | No agent or operator override on the existing action                                                                                      | No value movement                             |

A standing mandate is itself a governed object. It fixes supplier, beneficiary,
asset, per-invoice and period caps, required evidence, purchase-order rules,
effective dates, and revocation state. A material change exits the mandate; it
does not silently broaden it.

Every frozen policy decision sets `verificationMode` to exactly `NOT_REQUIRED`
or `REQUIRED`. Routine invoices do not buy circular evidence merely to create an
x402 transaction. The CourtGlass beneficiary exception sets it to `REQUIRED`;
without the paid result, that action cannot settle.

Unstructured model extraction alone is never sufficient for straight-through
payment. Missing or indeterminate evidence routes to review or blocked according
to the frozen policy, never to automatic execution.

## Representative exception

The memorable demo case is one invoice inside a normal batch:

> CourtGlass Iberia sent invoice `CG-2026-0718` for EUR 25,000. The supplier,
> purchase order, tax identifier, and invoice number match. The beneficiary does
> not match the approved supplier record, and no governed vendor change exists.

InvoiceGuard does not try to determine whether a call, message, or document is
synthetic. None is an authority source. It freezes the proposed payment as one
exception, purchases the configured supplier-evidence check, and asks the
required company roles to review only the consequential difference.

For the synthetic demo, that paid service reads a separately administered,
signed supplier-change registry fixture. The control API and payment agent
cannot write it. `MATCH` means only that the submitted supplier and beneficiary
fingerprints match one current registry entry; it does not prove real-world bank
account ownership.

## Product surfaces

1. **Invoice inbox:** one operational queue for received, auto-ready,
   review-required, scheduled, settled, blocked, and recovery states.
2. **Invoice workspace:** source document, extracted fields, approved supplier
   record, purchase-order match, duplicate status, and visible differences.
3. **Policy trace:** the exact rules, mandate, caps, evidence, and reason codes
   that selected straight-through, review, or blocked.
4. **Mobile approval:** a short-lived request containing the immutable
   exception, role, expiry, and World decision.
5. **Execution and reconciliation:** the paid evidence check, signing guard,
   Testnet effect, consensus receipt, and one-use state.
6. **Control evidence:** canonical action, redacted authority facts, role
   grants, sponsor receipts, refusal tests, limitations, and build SHA.

## Sponsor-owned transitions

| Sponsor surface         | State transition                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| World AgentKit          | A company-enrolled invoice or payment agent becomes eligible for its configured role; agents backed by the same human remain one accountability class.                                |
| World Human-in-the-Loop | A company user makes a fresh decision bound to an exact exception; the same human cannot fill two approval slots.                                                                     |
| Hedera                  | When policy requires it, the agent purchases the evidence service and waits for consensus; it then executes the exact admitted Testnet effect once and exposes reconcilable receipts. |

World does not replace company SSO or role authority. AgentKit establishes
human-backed-agent accountability. Human-in-the-Loop establishes fresh unique
human participation where the policy requires it. The company remains the source
of role and mandate authority.

Hedera turns InvoiceGuard from an approval dashboard into an economically
complete agent flow. The x402 service purchase and supplier settlement are
separate transactions joined by the action digest and durable evidence.

0G was evaluated as an optional private verifier and rejected on 2026-07-25. It
is not selected, installed, or shown in the demo.

## Product claim

> InvoiceGuard lets company-authorized, human-backed agents process routine
> supplier invoices within narrow standing mandates and routes material
> exceptions to fresh, exact, distinct-human approval before one-use execution.

## Non-claims

InvoiceGuard does not prove:

- the truth, legality, or tax compliance of an invoice;
- legal ownership of a beneficiary account;
- employment or company authority from a World result;
- that AgentBook and action-time World identifiers represent the same person;
- the correctness of model extraction or external evidence;
- sanctions, procurement, accounting, or banking compliance;
- that a Testnet token transfer is a real EUR or SEPA payment;
- that approving one payment updates the supplier master; or
- safety of payment paths that bypass the controlled gateway.

The live demo uses synthetic invoices and Testnet assets with no monetary value.
A production `PaymentRail` would integrate regulated bank, open-banking, or
stablecoin infrastructure under a separate review.

## Four-minute demo

The demo is one batch and one uninterrupted exception path:

1. **0:00–0:30:** import 100 clearly synthetic invoices through the API. Show
   `86 auto-ready`, `12 review`, and `2 blocked`.
2. **0:30–1:05:** open a recurring invoice and show the standing mandate and
   deterministic reasons it needs no per-invoice review.
3. **1:05–1:40:** open `CG-2026-0718`. Show the exact beneficiary difference,
   freeze the action, and leave the vendor master unchanged.
4. **1:40–2:25:** receive HTTP 402, pay for the supplier-evidence check on
   Hedera, wait for consensus, and receive a signed result bound to the action.
5. **2:25–3:15:** complete a mobile World approval, refuse a duplicate-human
   attempt, and accept the required distinct authorized delegate.
6. **3:15–4:00:** execute the exact Hedera Testnet effect once, expose HCS and
   Mirror evidence, mutate one beneficiary character, replay settlement, and
   show that the settlement count remains one.

The rail is a clearly labelled, no-value synthetic-EUR HTS Testnet token whose
exact ID and two-decimal parity rule are frozen in the action after the Hedera
spike passes. If that spike fails, no supplier invoice is shown as settled; HBAR
is used only for the separate x402 service purchase. The UI never presents HBAR
as a completed EUR bank payment.

## Product success criteria

- A finance operator understands the queue and next action without learning
  blockchain terminology.
- A neutral viewer can retell the scale problem, exception, control, and
  limitation after one explanation.
- Every sponsor changes an authorization or execution outcome.
- The live path succeeds ten times consecutively from an untouched build.
- Every negative test proves both the reason for refusal and absence of
  additional value movement.
- The repository, deployment, evidence bundle, and video reproduce the same
  commit.
