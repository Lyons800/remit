# Threat model

## Scope

This model covers the demonstrated path from action capture through
human-backed-agent eligibility, action-time human decisions, paid verification,
Hedera Testnet settlement, and audit export.

It does not claim to secure bank rails, custody providers, operating systems, or
credentials outside the controlled CallGuard gateway.

## Protected assets

- treasury Testnet funds and settlement authority;
- company-role issuer and verifier signing keys;
- World human identifiers and approval privacy;
- beneficiary and supplier evidence;
- canonical action integrity;
- one-use/idempotency state;
- audit evidence and judge-facing claims; and
- sponsor/API credentials.

## Adversaries

- an external fraudster issuing a convincing payment request;
- one human operating multiple approval agents;
- a compromised or stale company-role credential;
- a malicious or compromised agent;
- a substituted or dishonest verification service;
- a network attacker replaying or changing requests;
- a developer accidentally enabling a fake adapter or wrong network;
- a process crash during an uncertain financial operation; and
- an insider attempting to bypass the sole gateway.

## Threats, controls, and required tests

| ID  | Threat                                                                   | Primary control                                                              | Required negative test                                        |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| T01 | One human uses multiple agents or sessions to form quorum                | AgentBook tenant HMAC and action-scoped nullifier HMAC constraints           | Same-human agent or repeated human decision is not counted    |
| T02 | World decision is treated as company authority                           | Separately signed role credential and authenticated subject                  | Valid World decision without role is rejected                 |
| T03 | A company role is used without a fresh World decision                    | Independent Human-in-the-Loop requirement                                    | Valid role without World decision is rejected                 |
| T04 | Beneficiary, amount, asset, policy, or expiry changes after approval     | RFC 8785 canonical action plus SHA-256 digest                                | One-character mutation invalidates every approval             |
| T05 | A human decision or agent request is replayed or substituted             | Exact action/signal/URI/method/digest checks plus atomic consumption         | Reuse, path change, or cross-action copy is rejected          |
| T06 | A service response is substituted                                        | Service signature, action/evidence/payment binding                           | Response for another action is rejected                       |
| T07 | `UNKNOWN` is treated as success                                          | Closed result vocabulary and deterministic policy                            | Provider outage returns `UNKNOWN` and no transfer             |
| T08 | Payment is made twice after worker crash                                 | Persisted transaction bytes, outbox, network reconciliation, consumed action | Crash after submit produces one consensus transfer            |
| T09 | A failed process silently changes to a fake/local adapter                | Explicit adapter identity and live-mode startup assertion                    | Live mode refuses to boot with any fake                       |
| T10 | Wrong financial chain or mainnet is selected                             | Pinned Hedera Testnet configuration and allowlist                            | Non-Testnet financial network causes startup failure          |
| T11 | Treasury key is exposed to UI or identity service                        | Split keys and server-only worker                                            | Static/runtime secret scan plus browser bundle check          |
| T12 | InvoiceGuard leaks a stable World identifier or company linkage          | Tenant/action HMACs, display tags, and redaction                             | Logs/evidence contain no raw identifier                       |
| T13 | Expired or revoked company role remains counted                          | Time and revocation check at authorization and execution                     | Revoke after approval, before settlement: rejected            |
| T14 | Direct credential path bypasses CallGuard                                | Sole gateway owns constrained financial key                                  | Unauthorized direct-effect endpoint has no credential         |
| T15 | Audit trail overstates truth                                             | Claims manifest and typed evidence sources                                   | Export labels synthetic data and every trust boundary         |
| T16 | Optional 0G fails and public inference is used                           | No-fallback adapter and closed failure                                       | Disable private provider: `UNKNOWN`, no settlement            |
| T17 | Prompt injection changes a payment field or policy                       | Treat model output as untrusted candidate data                               | Malicious evidence cannot alter validated action/policy       |
| T18 | Denial of service exhausts paid calls or funds                           | Rate limits, spend caps, quote validation, idempotency                       | Duplicate request cannot trigger another service payment      |
| T19 | World lookup outage is misreported as an unregistered agent              | Independent RPC health check and fail-closed dependency status               | RPC outage returns unavailable, never an authorization result |
| T20 | A wallet is re-registered to another World principal after role issuance | Role grant binds wallet and tenant principal; re-resolve before execution    | Changed AgentBook mapping invalidates the role and approval   |

## Security invariants

1. `settlementCount(actionId) <= 1`.
2. Every counted delegate is enrolled and currently human-backed.
3. Every settled action has the required number of distinct AgentBook classes
   and action-scoped World decision classes.
4. Every counted delegate and application subject have a current required
   company role.
5. Every human decision, agent request, verification result, and settlement
   binds the same digest.
6. `MISMATCH`, `UNKNOWN`, expiry, revocation, mutation, and replay never move
   value.
7. No browser process receives a financial, issuer, verifier, HMAC, or provider
   secret.
8. Live mode has zero fake adapters.
9. Public evidence contains no raw World human identifier or sensitive source
   document.

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
