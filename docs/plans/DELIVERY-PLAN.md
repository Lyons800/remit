# Delivery plan

## Delivery objective

Ship one public, live, reproducible Classic-track product whose strongest
four-minute path is:

```text
freeze action
-> reject an unbacked or same-human delegate
-> collect a fresh action-bound World decision
-> accept distinct delegate + human + separate company role
-> receive x402 challenge
-> pay beneficiary-check service on Hedera
-> receive digest-bound MATCH
-> settle exact action once
-> reject mutation and replay
```

0G was evaluated and rejected. It cannot enter this path unless ADR 0005 is
explicitly reopened after every security blocker is resolved.

## Workstreams

| Workstream             | Responsibility                                                                     | Primary artifacts                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Domain and policy      | Action protocol, state machine, authority, reason codes, one-use invariants        | `packages/domain`, `packages/protocol`                                                   |
| World                  | AgentKit registration, Human-in-the-Loop, dual distinctness, privacy, live fixture | `packages/world-adapter`, World evidence                                                 |
| Hedera service         | x402 quote/payment/consensus, verifier response                                    | `services/verifier`, `services/payment-agent`, `services/x402-facilitator`, x402 adapter |
| Hedera settlement      | Financial worker, signing guard, outbox, recovery, HCS/Mirror evidence             | `services/settlement-worker`, settlement adapter, persistence                            |
| Product                | API, control room, attack lab, audit export                                        | `apps/control-api`, `apps/web`                                                           |
| Quality and operations | CI, security, observability, deployment, demo reliability                          | `.github`, `infra`, evidence scripts                                                     |
| Rejected 0G extension  | Preserve the no-go evidence                                                        | `docs/sponsors/ZERO-G-NO-GO.md`                                                          |

Workstreams may run in parallel only after their shared protocol contracts are
merged.

## Gates

### G0 - repository foundation

Pass when:

- Classic-track provenance is committed;
- architecture, claims, threat model, ADRs, contribution rules, and session
  protocol are reviewed;
- exact runtime/package manager are pinned;
- CI validates formatting, types, tests, build, secrets, and dependency policy;
  and
- the public remote and branch rules exist.

### G1 - canonical domain kernel

Pass when:

- versioned action and signed-envelope schemas exist;
- RFC 8785/SHA-256 known vectors pass;
- mutation property tests cover every field;
- deterministic policy reason codes are exhaustive;
- state-machine property tests prohibit invalid transitions;
- World, Hedera, and verifier ports have contract tests; and
- no sponsor or framework dependency exists in the domain.

### G2 - World live authority

Pass when:

- the ECDSA agent wallets are registered through the documented AgentKit flow;
- `A1` and `A2` resolve to the same human and count once;
- action-time World proofs bind the exact action, role, decision, subject, and
  expiry;
- repeated action-human and AgentBook-human classes each fail quorum;
- a distinct delegate with a distinct fresh action-human proof can count;
- raw human identifiers are absent from logs and public evidence;
- missing, expired, and revoked company roles fail;
- action/nonce/expiry replay fails; and
- the sponsor evidence record cites package, network, transaction/registration
  references, commit, and first-party documentation.

If two real humans cannot be exercised, the product does not claim this gate.

### G3 - Hedera x402 service

Pass when:

- the verifier returns HTTP 402;
- the worker creates the exact requested Hedera Testnet payment;
- consensus is awaited before release;
- the service returns a signed result bound to the action, evidence, expiry, and
  service-payment transaction;
- wrong amount, recipient, digest, result, signature, expiry, and substituted
  response fail; and
- transaction and Mirror/HashScan evidence are exported.

### G4 - exact settlement and crash recovery

Pass when:

- the settlement account is separate and capped;
- the worker validates exact recipient, integer amount, asset, network, memo,
  digest, and expiry before signing;
- the same frozen transaction is reconciled after an uncertain submit;
- crash-before-submit, crash-after-submit, timeout, and retry tests yield at
  most one transfer;
- mutation and replay show no second movement; and
- HCS/Mirror evidence is linked without being presented as external truth.

### G5 - full product movie

Pass when:

- the live deployment uses no required fake adapter;
- the desktop control room, mobile approval, paid verification, settlement,
  attack lab, and audit bundle form one coherent responsive web application;
- one untouched build succeeds ten consecutive times;
- the four-minute script finishes with at least 15 seconds of margin;
- a neutral viewer correctly retells the product;
- two target users give structured feedback; and
- World and Hedera engineers have seen the red path or answered the exact
  implementation questions.

### G6 - 0G admission closed

The 2026-07-25 review failed the private testnet model, authenticated E2EE, and
exact proof-binding requirements. No 0G implementation PR is scheduled. World +
Hedera remain the complete submission.

### G7 - submission

Pass when:

- repository is public and auditable;
- live deployment and source resolve to the same commit;
- README includes setup, architecture, payment flow, sponsor code pointers,
  synthetic-data label, and limitations;
- sponsor feedback/evidence requirements are complete;
- videos meet every duration limit;
- project page contains screenshots and exact selected-prize explanations;
- no secret or sensitive stable identifier appears in repository, CI, logs,
  video, or evidence; and
- a clean machine reproduces the documented path.

## Pull-request sequence

|  PR | Branch                   | Outcome                                                             | Depends on        |
| --: | ------------------------ | ------------------------------------------------------------------- | ----------------- |
|   1 | `chore/foundation`       | Governance, architecture, workspace, CI, runnable service skeletons | provenance commit |
|   2 | `feat/action-protocol`   | Canonical action, envelopes, state machine, policy, property tests  | PR 1              |
|   3 | `spike/world-authority`  | AgentKit and Human-in-the-Loop live authority fixture               | PR 2              |
|   4 | `spike/hedera-x402`      | Real 402 -> payment -> consensus -> signed result                   | PR 2              |
|   5 | `feat/settlement-worker` | Exact Hedera settlement, outbox, recovery, HCS/Mirror evidence      | PR 4              |
|   6 | `feat/control-plane`     | Persistence, API, role issuer, approval orchestration, audit export | PRs 2-5           |
|   7 | `feat/control-room`      | Responsive desktop control room, mobile approval, and attack lab    | PR 6              |
|   8 | `test/live-demo-path`    | Live E2E, ten-run reliability, crash and adversarial suite          | PR 7              |
|   9 | `docs/submission`        | Final docs, sponsor feedback, evidence, video, deployment manifest  | PR 8              |

PRs 3 and 4 may run in parallel in separate worktrees. PR 5 must not begin from
undocumented assumptions about PR 4's transaction lifecycle.

## Definition of vertical-slice complete

The first vertical slice is not a polished dashboard. It is a CLI or minimal API
demonstration where real identifiers and receipts prove:

1. unbacked, same-AgentBook-human, and repeated action-human paths fail;
2. valid delegate, fresh-human, and company-role quorum passes;
3. Hedera service payment reaches consensus;
4. the signed response binds the same action;
5. exact settlement occurs once; and
6. mutation and replay do not move value.

The UI is built on this spine, never instead of it.

## Integration cadence

- Rebase active branches at a declared integration point.
- Merge shared protocol changes before adapter implementations depend on them.
- Run the full quality suite after each merge.
- Run protected live tests after sponsor or transaction changes.
- Update the build log, sponsor questions, claims, and session handoff.
- Keep a known-green demo SHA and deployment while new work continues.

## Decision ownership

- Product/claims: product lead.
- Domain/security invariants: architecture owner.
- Sponsor behavior: integration owner with first-party evidence.
- Financial key/network changes: two-person review.
- Demo and submission: demo owner plus architecture sign-off.
- 0G admission gate: explicit architecture review, not developer discretion.
