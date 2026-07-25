# Product brief

## Product

InvoiceGuard is the accounts-payable workflow on CallGuard's exact-action
control plane. It handles an invoice whose supplier payout instruction differs
from the company's approved vendor record.

## Inciting incident

A finance employee receives a convincing video or voice call:

> Our supplier changed banks. Send the outstanding EUR 25,000 to this new
> beneficiary today.

The request may be legitimate or fraudulent. InvoiceGuard does not try to
classify the media. The call is never an authority source.

## First buyer and users

- Economic buyer: finance, treasury, accounts-payable, or security leadership at
  a company operating autonomous payment agents.
- Primary operator: accounts-payable employee reviewing the invoice exception.
- Invoice agent: an AgentKit-registered agent enrolled by the company to propose
  the canonical action.
- Approval delegates: company-enrolled AgentKit agents with separately issued
  roles. Their users review the exact action on desktop or mobile and complete a
  World Human-in-the-Loop decision.
- Auditor: security, finance, or compliance reviewer inspecting why value did or
  did not move.

## Job to be done

When an urgent request changes a beneficiary or other material payment term,
ensure that:

1. only company-enrolled, human-backed agents can participate in the controlled
   path;
2. the exact requested action is immutable;
3. each counted approval delegate has a current company role and a fresh World
   proof bound to the action;
4. neither multiple agents backed by one AgentBook human nor repeated
   action-time proof from one World human can fill two approval slots;
5. the configured evidence check is purchased and bound to that action;
6. only the unchanged, unexpired action can execute once; and
7. positive and rejected attempts are auditable without overstating what the
   system proves.

## Product surfaces

1. **Desktop control room:** compare the invoice with the approved vendor
   record, freeze the canonical action, and show policy and execution state.
2. **Mobile approval:** open a short-lived, role-scoped request, render the
   exact changed fields, and complete or reject a World-bound decision.
3. **Approval room:** show company roles, World uniqueness classes, expiry, and
   remaining quorum without exposing stable World identifiers.
4. **Verification service:** quote, pay for, and consume a result bound to the
   action.
5. **Settlement:** expose the exact beneficiary, amount, network, receipt, and
   one-use status.
6. **Attack lab:** run duplicate-human, unbacked-agent, missing-role, mutation,
   expiry, substitution, and replay attempts.
7. **Audit bundle:** export the request, decisions, proofs, transaction
   references, limitations, and software version.

## Sponsor-owned transitions

| Sponsor surface         | State transition                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| World AgentKit          | An enrolled agent becomes eligible to approve or request execution; agents backed by the same human remain one quorum class.                 |
| World Human-in-the-Loop | A company user makes a fresh decision bound to the immutable action; the same human cannot fill two approval slots.                          |
| Hedera                  | The agent purchases the verification service, waits for consensus, executes the permitted Testnet financial operation, and exposes receipts. |

0G was evaluated as an optional private verifier and rejected on 2026-07-25:
testnet has no suitable private text model, and the current E2EE client does not
authenticate the provider encryption key or response. It is not selected,
installed, or shown in the demo. There is no third or fourth partner.

## Product claim

> InvoiceGuard enforces human-backed-agent eligibility, fresh distinct-human
> approval, company role, exact action, verification result, expiry, and one-use
> controls for the shown payment path.

## Non-claims

InvoiceGuard does not prove:

- whether a call is synthetic;
- who the caller is;
- employment or company authority from a World result;
- legal ownership of a beneficiary account;
- truth of source documents or model output;
- sanctions, tax, accounting, or legal compliance; or
- safety of payment paths that bypass the controlled gateway.

## Definition of a compelling demo

The four-minute demo must show one uninterrupted live path:

1. compare a synthetic EUR 25,000 invoice with the approved vendor record;
2. reject an unbacked agent before it can join the approval path;
3. freeze the changed beneficiary as one immutable action;
4. accept one fresh action-bound decision from an authorized human;
5. reject a second delegate backed by the same AgentBook human;
6. reject the same action-time World human attempting to fill another slot;
7. accept a distinct authorized delegate with a fresh human decision;
8. receive HTTP 402 and pay the verification service on Hedera;
9. receive a signed result bound to the action;
10. execute the exact Testnet payment once; and
11. reject mutation and replay while showing that no second transfer occurred.

The verifier initially uses a deterministic synthetic beneficiary fixture. It
remains replaceable behind the signed verification contract without changing the
authorization protocol.

## Product success criteria

- A neutral viewer can retell the loss, control, and limitation after one
  explanation.
- Every sponsor changes an authorization or execution outcome.
- The live path succeeds ten times consecutively from an untouched build.
- Every negative test proves both the reason for refusal and absence of value
  movement.
- The repository, deployment, evidence bundle, and video reproduce the same
  commit.
