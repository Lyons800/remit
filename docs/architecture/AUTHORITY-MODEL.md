# Authority model

CallGuard deliberately separates facts that are often collapsed into "identity."

## Independent facts

| Fact                | Source                               | What it permits                                                               | What it does not prove                                        |
| ------------------- | ------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Agent backing       | World AgentKit / AgentBook           | The enrolled agent is backed by a registered human and may enter the workflow | Name, employment, honesty, company role, or payment authority |
| Company role        | Configured company credential issuer | The enrolled agent and authenticated application subject hold a required role | Distinct humanity, fresh review, or beneficiary ownership     |
| Human decision      | World Human-in-the-Loop / IDKit      | A unique human made a decision bound to this exception before expiry          | Employment, company authority, or correctness of the action   |
| Agent execution     | Exact agent signature                | The eligible agent requested the authorized effect for this digest            | Fresh human review or evidence truth                          |
| Verification result | Configured paid service              | The service returned its declared result for this evidence and action         | Legal ownership, compliance, or universal truth               |

Settlement requires every configured fact under one deterministic policy. No
fact substitutes for another.

## Human identifier privacy

The World identifier is treated as a sensitive stable pseudonym.

1. Resolve AgentBook identifiers and World decision nullifiers only inside the
   control API.
2. Derive tenant-scoped HMAC values for agent accountability and action-scoped
   HMAC values for decision deduplication.
3. Derive a separate action-scoped display tag when a UI or evidence bundle
   needs a local label.
4. Store the raw identifier only when technically unavoidable and with a short
   retention period.
5. Never place it in HCS messages, Hedera memos, browser telemetry, public
   evidence, or ordinary logs.
6. Display only "same human as approval 1" or "distinct human" with the
   corresponding World verification status.

The raw identifier is publicly queryable, pseudonymous AgentBook data and is
linkable across wallets registered by the same human within AgentBook. The HMAC
prevents CallGuard from creating another public join; it does not make the
source identifier secret on World Chain.

## Company role credential

The initial implementation uses a short-lived, issuer-signed credential that
binds an approval delegate to its authenticated application subject:

```text
issuer
organizationId
subjectId
subjectAgentId
agentTenantPrincipal
roles
credentialId
scopeHash
maximumAmountAtoms
notBefore
expiresAt
policyAudience
```

The control API pins the issuer public key and checks signature, audience,
subject, agent wallet, AgentBook-derived tenant principal, scope, amount, time
bounds, and a revocation record. The approval session is authenticated as the
same application subject, and the World proof signal binds a hash of that
subject, role, and action. For a policy that requires human approval, the demo
must show:

- valid World decision with no role: rejected;
- valid role with no fresh World decision: rejected;
- expired or revoked role: rejected; and
- required role and distinct action-scoped human class on the unchanged action:
  accepted.

This credential is a demonstration of a company trust root, not a claim that
CallGuard has independently verified employment.

## Exact-action human decision

The mobile or desktop approval page receives a short-lived, single-use,
role-scoped token. It loads the immutable action from the control API and sends
no mutable payment fields back.

World Human-in-the-Loop requests a proof with:

- one action derived from the canonical action digest, policy, role, and
  decision;
- one signal derived from the authenticated company subject and action;
- a short RP-signature expiry; and
- a server webhook that verifies and consumes the proof.

The control API verifies the World proof, recomputes the stored action digest,
checks the authenticated subject's role, and atomically consumes the approval
session. It stores an action-scoped HMAC of the World nullifier so one human
cannot fill another approval slot without exposing the stable source value.
Every counted slot is also unique by authenticated company subject, so a shared
or replayed company session cannot represent two approvers.

## Exact-agent execution

AgentKit remains a separate execution boundary. The company enrolls the agent
wallet after proving possession and resolving its AgentBook backing. Before the
agent may initiate the workflow or request settlement, it signs an exact
short-lived challenge containing the action digest. The gateway verifies the
signature, exact URI, resource, statement, method, chain, nonce, expiry, and
current AgentBook mapping.

AgentKit proves that the wallet is registered to a World ID human. It does not
prove that the backing human reviewed this payment at signing time; the
Human-in-the-Loop decisions provide that separate fact.

## Standing mandate

Routine invoices may omit per-invoice Human-in-the-Loop approval only when the
action matches an unexpired, unrevoked standing mandate. A mandate is an
immutable company authorization that fixes:

```text
organizationId
supplierId
supplierSnapshotDigest
approvedBeneficiary
assetId
networkId
maximumInvoiceAmountAtoms
maximumPeriodAmountAtoms
period
requiredEvidencePolicy
purchaseOrderPolicy
notBefore
expiresAt
mandateId
mandateVersion
```

The invoice agent and payment agent cannot create or broaden a mandate. The
company governance flow issues it under separately authenticated roles and the
configured approval policy. A beneficiary, asset, supplier snapshot, evidence
requirement, cap, or validity change creates a new mandate and never inherits
old payment actions.

Unstructured document extraction cannot by itself qualify for a mandate. The
policy requires an authenticated structured source or independently confirmed
canonical fields, exact supplier and beneficiary matches, duplicate clearance,
and every configured purchase-order and evidence check.

Approving one invoice exception authorizes only that immutable payment action.
It never updates the supplier master or creates a mandate.

## Deterministic authorization rule

An action may proceed only when:

```text
action is unexpired and unconsumed
AND action digest recomputes exactly
AND the requesting agent is enrolled, currently human-backed, and company-authorized
AND either:
    action is fully contained by a current standing mandate with zero per-invoice approvals
    OR required company-subject, AgentBook, and action-human quorums are present
AND every required decision has a valid company role
AND every used World proof, approval session, and agent challenge was atomically consumed once
AND the configured verification envelope is valid and MATCH
AND mandate or human decisions, verification, and agent execution bind the same digest and policy
AND requested settlement is byte-for-byte within the authorized effect
```

An LLM may extract candidate fields or produce a recommendation. It cannot
change this rule or sign a financial effect.

## Delegation to financial keys

World-registered agent wallets, human approval sessions, and Hedera financial
accounts are different security principals. The gateway maps an authorized
action to a constrained financial effect. Neither an identity key nor a browser
session receives the treasury key.

The settlement account is allowed to execute only:

- Hedera Testnet;
- the exact recipient and integer amount in the action;
- before the action expiry;
- under the configured per-action and per-day caps; and
- once for the action's idempotency key.

## Revocation and emergency controls

- Role credentials can be revoked independently of World registration.
- Standing mandates can be paused or revoked independently of supplier records.
- Organization policy versions can be disabled for new actions.
- Verifier keys and service endpoints can be disabled.
- Financial accounts can be paused at the worker/gateway boundary.
- Existing signed approvals never migrate to a new action or policy version.
- An emergency stop prevents new effects but cannot reverse a settled
  transaction.
