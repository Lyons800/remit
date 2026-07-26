# Authority model

Remit deliberately separates facts that are often collapsed into "identity."

## Independent facts

| Fact                    | Source                               | What it permits                                                               | What it does not prove                                            |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Application identity    | Google through Better Auth           | The subject may hold a revocable InvoiceGuard session                         | Employment, company role, distinct humanity, or payment authority |
| Organization membership | Better Auth organization plugin      | The subject may access one organization's configured product surfaces         | A finance role, approval authority, or permission to move value   |
| Agent backing           | World AgentKit / AgentBook           | The enrolled agent is backed by a registered human and may enter the workflow | Name, employment, honesty, company role, or payment authority     |
| Company role            | Configured company credential issuer | The enrolled agent and authenticated application subject hold a required role | Distinct humanity, fresh review, or beneficiary ownership         |
| Human decision          | World Human-in-the-Loop / IDKit      | A unique human made a decision bound to this exception before expiry          | Employment, company authority, or correctness of the action       |
| Agent execution         | Exact agent signature                | The eligible agent requested the authorized effect for this digest            | Fresh human review or evidence truth                              |
| Verification result     | Configured paid service              | The service returned its declared result for this evidence and action         | Legal ownership, compliance, or universal truth                   |

Settlement requires every configured fact under one deterministic policy. No
fact substitutes for another.

Application identity and organization membership are prerequisite access facts,
not financial authority. A Better Auth owner or admin has no payment role until
the configured company credential issuer separately grants one. Email domain,
Google profile data, and organization creation never perform that grant.

## Human identifier privacy

The World identifier is treated as a sensitive stable pseudonym.

1. Resolve AgentBook identifiers and World decision nullifiers only inside the
   control API.
2. Derive tenant-scoped HMAC values for agent accountability and action-scoped
   HMAC values for decision deduplication. Every stored principal names its
   derivation-key version. During key rotation, derive the current and every
   still-admitted previous alias from the transient raw identifier; the physical
   repository must reserve all aliases in one transaction.
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
prevents Remit from creating another public join; it does not make the source
identifier secret on World Chain.

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
sourceAssetId
maximumSourceAmountAtoms
settlementNetworkId
settlementAssetId
maximumSettlementAmountAtoms
mappingPolicyHash
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
Remit has independently verified employment.

## Exact-action human decision

The mobile or desktop approval page receives a short-lived, single-use,
role-scoped token. It loads the immutable action from the control API and sends
no mutable payment fields back.

World Human-in-the-Loop requests a proof with:

- one action derived only from the organization and canonical action digest,
  reused across every role and decision slot;
- one signal derived from the authenticated company subject, approval session,
  role, decision, role grant, agent, action, and expiry;
- a short RP-signature expiry; and
- a server webhook that verifies and consumes the proof.

The control API verifies the World proof, recomputes the stored action digest,
checks the authenticated subject's role, and atomically consumes the approval
session. It stores an action-scoped HMAC of the World nullifier so one human
cannot fill another approval slot without exposing the stable source value.
Every counted slot is also unique by authenticated company subject, so a shared
or replayed company session cannot represent two approvers.

### Adapter-verified approval-fact boundary

Sponsor proof verification ends at the control API, not in the domain package.
The World adapter verifies the proof cryptography, relying-party origin, action,
signal, nullifier scope and expiry. The company credential adapter verifies the
issuer, role, subject, revocation and time bounds. The AgentBook adapter
resolves the current tenant-scoped backing principal.

One World verifier/composition path correlates the validated AP authorization
bundle, exact IDKit request and verified response, approval and requester
AgentKit claims, current AgentBook resolutions, and current company-role
authority. Its configured World deployment and composition policy are
process-branded and frozen. The request, evidence IDs, identity claims, and
admission bundle all bind the deployment and composition-policy digests.
Serialized copies lose those process brands and must re-enter through the owning
verifier or an authenticated persistence boundary.

Every successful AgentBook resolution carries the observed numeric chain and
CAIP-2 network, registry ID and contract address, resolver adapter ID and
version, backing-record source, record ID, and validity window. The composition
path compares all of that provenance to the frozen policy before it selects a
`CURRENT` status.

The path derives tenant and action principals plus every current and overlap
alias directly from transient raw identifiers and the authoritative keyring. It
rejects caller-supplied alias arrays and computes each fact expiry as the
minimum of every applicable authorization, session, relying-party, AgentKit,
AgentBook, role, and World-proof ceiling.

The domain's `createAdapterVerifiedApprovalFact` and
`createRequestingAgentExecutionFact` factories are intentionally public
structural validators. Their `recordDigest` values are canonical integrity
checks, not signatures, authentication, writer provenance, or proof that the
fields came from World. Any code with the same fields can construct the same
record. Consequently a loose fact is never authority merely because it parses,
has a valid digest, or says `CURRENT` or `VERIFIED`.

Instead, the World path creates one `WorldAuthorityAdmissionBundle` whose digest
binds both facts, exact AgentBook provenance, deployment and policy identities,
and all approval and requester identity claims, including every current and
overlap alias. The public World API returns no loose facts. It succeeds only
after passing the whole bundle to its configured process-branded
admission-writer capability and returns that writer's bundle-bound receipt. The
process brand protects the in-process seam from deserialized structural
substitution; it is not durable authentication and does not make an
untrustworthy composition root safe.

The domain still checks action, decision, role, time, status and distinctness.
Live authority additionally requires the authenticated physical repository to
consume the decision, proof, challenge and approval session; reserve every
company-subject, AgentBook-principal and action-human alias; and persist the
whole bundle, both facts and its writer receipt under one serializable
transaction and atomic group. That persistence integration is not present on
this branch, so live World authority remains a NO-GO.

## Exact-agent execution

AgentKit remains a separate execution boundary. The company enrolls the agent
wallet after proving possession and resolving its AgentBook backing. Before the
agent may initiate the workflow or request settlement, it signs an exact
short-lived challenge containing the action digest. The gateway verifies the
signature, exact URI, resource, statement, method, chain, nonce, expiry, and
current AgentBook mapping.

The frozen policy also names the executor adapter, required role, scope,
audience, tenant-binding rule, subject-binding rule, and immutable grant ID,
version and digest. An adapter-verified execution fact records those fields, the
current grant status, the AgentBook registry and backing record, its AgentKit
challenge and signed-proof digest, immutable fact ID, and verification window.
Hydration proves that a retained fact was valid at the transition that used it;
it does not turn historical evidence into perpetual authority. Authorization,
audit commit, settlement freeze, and retry each re-resolve the backing and grant
and must match the frozen adapter, policy, signed-proof identity, fact identity,
and original validity ceiling exactly. A refresh may be newer and shorter lived;
it cannot extend the original authorization.

The same World admission bundle carries the `RequestingAgentExecutionFact`,
deriving policy-owned fields from the verified authorization bundle and observed
AgentBook provenance rather than caller input. The public domain factory remains
structural; only the authenticated bundle write can establish repository
authority.

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
sourceAssetId
maximumSourceInvoiceAmountAtoms
settlementAssetId
settlementNetworkId
settlementBeneficiary
mappingPolicyHash
maximumSettlementInvoiceAmountAtoms
maximumSettlementPeriodAmountAtoms
period
sourceRequirement
verificationMode
requiredEvidencePolicy
purchaseOrderPolicy
notBefore
expiresAt
mandateId
mandateVersion
```

The invoice agent and payment agent cannot create or broaden a mandate. The
company governance flow issues it under separately authenticated roles and the
configured approval policy. Source caps are measured in source-asset atoms;
execution and period caps are measured in settlement-asset atoms after the exact
frozen mapping. A beneficiary, source asset, settlement asset or network,
mapping rule, supplier snapshot, evidence requirement, cap, or validity change
creates a new mandate and never inherits old payment actions.

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
AND the requesting agent is enrolled, currently human-backed, and authorized
    by the frozen role, grant version, scope, audience, subject and tenant
AND either:
    action is fully contained by a current standing mandate with zero per-invoice approvals
    OR required company-subject, AgentBook, and action-human quorums are present
AND every required decision has a valid company role
AND every used World proof, approval session, and agent challenge was atomically consumed once
AND either:
    frozen verification mode is NOT_REQUIRED
    OR the configured verification envelope is valid, MATCH, and unexpired
       at every transition that creates a new effect
AND mandate or human decisions, verification mode or result, and agent execution bind the same digest and policy
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
