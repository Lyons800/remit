# Threat model

## Scope

This model covers the demonstrated path from invoice ingestion and supplier
reconciliation through action capture, agent eligibility, deterministic routing,
action-time human decisions, paid verification, Hedera Testnet settlement,
reconciliation, and audit export.

It does not claim to secure bank rails, custody providers, operating systems, or
credentials outside the controlled InvoiceGuard gateway.

## Protected assets

- treasury Testnet funds and settlement authority;
- company-role issuer and verifier signing keys;
- World human identifiers and approval privacy;
- beneficiary and supplier evidence;
- raw invoice documents, connector credentials, and supplier-master records;
- canonical action integrity;
- one-use/idempotency state;
- audit evidence and judge-facing claims; and
- sponsor/API credentials.

## Adversaries

- an external fraudster issuing a convincing payment request;
- a malicious supplier document or spoofed connector event;
- one human operating multiple approval agents;
- a compromised or stale company-role credential;
- a malicious or compromised agent;
- a substituted or dishonest verification service;
- a network attacker replaying or changing requests;
- a developer accidentally enabling a fake adapter or wrong network;
- a process crash during an uncertain financial operation; and
- an insider attempting to bypass the sole gateway.

## Threats, controls, and required tests

| ID  | Threat                                                                     | Primary control                                                                  | Required negative test                                         |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| T01 | One human uses multiple agents or sessions to form quorum                  | AgentBook tenant HMAC and action-scoped nullifier HMAC constraints               | Same-human agent or repeated human decision is not counted     |
| T02 | World decision is treated as company authority                             | Separately signed role credential and authenticated subject                      | Valid World decision without role is rejected                  |
| T03 | An exception role is used without a fresh World decision                   | Independent Human-in-the-Loop requirement for `HUMAN_APPROVAL`                   | Exception role without World decision is rejected              |
| T04 | Beneficiary, amount, asset, policy, or expiry changes after approval       | RFC 8785 canonical action plus SHA-256 digest                                    | One-character mutation invalidates every approval              |
| T05 | A human decision or agent request is replayed or substituted               | Exact action/signal/URI/method/digest checks plus atomic consumption             | Reuse, path change, or cross-action copy is rejected           |
| T06 | A service response is substituted                                          | Service signature, action/evidence/payment binding                               | Response for another action is rejected                        |
| T07 | `UNKNOWN` is treated as success                                            | Closed result vocabulary and deterministic policy                                | Provider outage returns `UNKNOWN` and no transfer              |
| T08 | Payment is made twice after worker crash                                   | Persisted transaction bytes, outbox, network reconciliation, consumed action     | Crash after submit produces one consensus transfer             |
| T09 | A failed process silently changes to a fake/local adapter                  | Explicit adapter identity and live-mode startup assertion                        | Live mode refuses to boot with any fake                        |
| T10 | Wrong financial chain or mainnet is selected                               | Pinned Hedera Testnet configuration and allowlist                                | Non-Testnet financial network causes startup failure           |
| T11 | Treasury key is exposed to UI or identity service                          | Split keys and server-only worker                                                | Static/runtime secret scan plus browser bundle check           |
| T12 | InvoiceGuard leaks a stable World identifier or company linkage            | Tenant/action HMACs, display tags, and redaction                                 | Logs/evidence contain no raw identifier                        |
| T13 | Expired or revoked company role remains counted                            | Time and revocation check at authorization and execution                         | Revoke after approval, before settlement: rejected             |
| T14 | Direct credential path bypasses InvoiceGuard                               | Sole gateway owns constrained financial key                                      | Unauthorized direct-effect endpoint has no credential          |
| T15 | Audit trail overstates truth                                               | Claims manifest and typed evidence sources                                       | Export labels synthetic data and every trust boundary          |
| T16 | Rejected 0G or public inference is reintroduced as a verifier              | No installed adapter and explicit admission ADR                                  | Unadmitted provider cannot enter live mode                     |
| T17 | Model extraction is treated as authoritative payment data                  | Candidate-data boundary and deterministic corroboration                          | High-confidence output alone cannot auto-pay                   |
| T18 | Denial of service exhausts paid calls or funds                             | Rate limits, spend caps, quote validation, idempotency                           | Duplicate request cannot trigger another service payment       |
| T19 | World lookup outage is misreported as an unregistered agent                | Independent RPC health check and fail-closed dependency status                   | RPC outage returns unavailable, never an authorization result  |
| T20 | A wallet is re-registered to another World principal after role issuance   | Role grant binds wallet and tenant principal; re-resolve before execution        | Changed AgentBook mapping invalidates the role and approval    |
| T21 | One invoice is submitted through several sources and paid more than once   | Source idempotency, content hash, business duplicate, and paid-action checks     | Email and API copies produce at most one payable               |
| T22 | Invoice extraction poisons or silently changes the supplier master         | Candidate-data boundary and separate governed master-data workflow               | Extracted beneficiary cannot update an approved supplier       |
| T23 | A malicious attachment or prompt changes policy or canonical fields        | Quarantine, bounded parsing, untrusted extraction, deterministic freeze          | Injected instructions cannot authorize or mutate an action     |
| T24 | A spoofed connector event enters another organization                      | Signed webhook, server-resolved connection, tenant constraints                   | Wrong signature or tenant binding is rejected                  |
| T25 | An invoice currency is mislabeled as the executed settlement asset         | Explicit CAIP asset, atom count, rail, and separate source display               | EUR source cannot be presented as an HBAR payment              |
| T26 | A close or unavailable payee result is treated as `MATCH`                  | Closed provider mapping and fail-closed policy                                   | Close, no-match, and unavailable never auto-pay                |
| T27 | A standing mandate is widened, expired, revoked, or applied to new details | Immutable mandate digest, exact containment, caps, and execution-time recheck    | Any changed or stale mandate blocks straight-through payment   |
| T28 | Testnet execution is presented as a real supplier bank payment             | Synthetic-asset label and typed payment-rail evidence                            | UI and export retain the Testnet limitation                    |
| T29 | A crafted PDF exploits the parser to read secrets or exfiltrate data       | Sandboxed one-document worker, no long-lived credentials or egress, hard limits  | Worker cannot reach network/secrets; crash quarantines input   |
| T30 | A hydrated authority fact bypasses a revoked role, grant, or backing       | Historical-time validation plus fresh effect-time revalidation                   | Stale, revoked, expired, wrong-scope hydration is rejected     |
| T31 | A valid service, network, quote, receipt, or adapter is substituted        | Frozen service policy and exact cross-boundary fact binding                      | Cross-service, network, quote, and adapter copies are rejected |
| T32 | An uncertain transaction is retried after expiry or authority loss         | No caller attempt; current authority and mandate recheck before exact-byte retry | Expired, revoked, or paused retry emits no effect              |
| T33 | A pending row is polled twice or missed before first settlement submission | Attempt and deterministic submission outbox are one atomic aggregate transition  | Crash at commit yields one recoverable logical submission      |
| T34 | HCS postcommit failure is reported as failed payment or repeats value      | Audit-pending/degraded states and same-ID audit retry preserve consumed value    | Audit recovery never emits another transfer or consumption     |
| T35 | Concurrent or key-rotation aliases let one human fill two approval slots   | Serializable proof consumption plus all-version three-principal unique keys      | Racing or cross-version claims admit one quorum identity       |

## Security invariants

1. `settlementCount(actionId) <= 1` and `settlementCount(obligationId) <= 1`.
2. Every counted delegate is enrolled and currently human-backed.
3. Every settled action has the required number of distinct AgentBook classes
   and action-scoped World decision classes, unless it is exactly contained by a
   current zero-per-invoice-approval mandate.
4. Every requesting agent, counted delegate, and application subject has its
   current required company authority.
5. Every human decision, agent request, verification result, and settlement
   binds the same digest.
6. `MISMATCH`, `UNKNOWN`, expiry, revocation, mutation, and replay never move
   value.
7. No browser process receives a financial, issuer, verifier, HMAC, or provider
   secret.
8. Live mode has zero fake adapters.
9. Public evidence contains no raw World human identifier or sensitive source
   document.
10. An invoice observation cannot update a supplier master or standing mandate.
11. Source duplication, accounting write-back failure, and process retry cannot
    create another payable or financial effect.
12. Attachment parsing has no network egress or long-lived application,
    identity, storage, or financial credential.
13. Hydrated authorization is historical evidence only; every new financial
    effect requires current frozen-policy authority.
14. Settlement retry emits only the aggregate-held canonical transaction bytes
    and retains uncertainty when revalidation fails.
15. Verification, audit, settlement receipt, and consumption records retain
    their exact service, adapter, network, writer, attempt, and atomic context.
16. Queueing settlement and its initial submission outbox effect share one
    aggregate atomic group; a poller never invents first submission.
17. A successful settlement remains consumed while execution audit is pending,
    degraded, retried, or recovered.
18. Approval decisions, sessions, World proofs, AgentKit challenges, company
    subjects, AgentBook principals, and action-human principals cannot race into
    duplicate quorum slots.
19. One payment action has one World action identifier across every role and
    decision; slot-specific authority remains in the signal.

## Review gates

- Any change to a security invariant requires an ADR and security review.
- Any new signing format requires known-vector tests and independent
  verification.
- Any sponsor SDK upgrade requires a changelog review and live contract test.
- Any new network requires an allowlist change and explicit environment review.
- Any new data field requires a classification and retention decision.

## Reporting

Do not open a public issue for a vulnerability involving secrets or a working
financial exploit. Follow the repository security policy.
