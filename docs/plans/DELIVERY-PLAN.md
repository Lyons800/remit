# Delivery plan

## Delivery objective

Ship one public, live, reproducible Classic-track product whose strongest
four-minute path is:

```text
ingest a 100-invoice supplier batch
-> normalize and deduplicate the records
-> route 86 under standing mandates, 12 to review, and 2 to block
-> show one routine invoice ready for straight-through payment
-> open a €25,000 changed-beneficiary exception
-> freeze the exact payment action
-> purchase a digest-bound supplier-evidence result through x402 on Hedera
-> collect fresh, action-bound World decisions from the required roles
-> settle only the unchanged action, once
-> reject mutation, duplicate submission, and replay
```

The batch is synthetic and every test-network asset is labelled exactly. The
product must never imply that a Testnet HBAR amount is a euro settlement.

0G was evaluated and rejected. It cannot enter this path unless ADR 0005 is
explicitly reopened after every security blocker is resolved.

## Workstreams

| Workstream             | Responsibility                                                                                   | Primary artifacts                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Invoice operations     | Intake, source observations, canonical invoices, suppliers, duplicates, policy, standing mandate | `apps/control-api`, `packages/domain`, `packages/persistence`                            |
| Action protocol        | Exact payment action, signed envelopes, state machine, one-use invariants                        | `packages/protocol`, `packages/domain`                                                   |
| World authority        | AgentKit registration, company backing, Human-in-the-Loop, distinctness, privacy                 | `packages/world-adapter`, World evidence                                                 |
| Hedera evidence        | x402 quote, payment, consensus, signed supplier-evidence result                                  | `services/verifier`, `services/payment-agent`, `services/x402-facilitator`, x402 adapter |
| Hedera settlement      | Financial worker, signing guard, outbox, recovery, HCS/Mirror evidence                           | `services/settlement-worker`, settlement adapter, persistence                            |
| Product experience     | Invoice queue, policy trace, exception approval, payment state, audit export                     | `apps/web`, `apps/control-api`                                                           |
| Quality and operations | CI, security, observability, deployment, demo reliability                                        | `.github`, evidence scripts                                                              |
| Rejected 0G extension  | Preserve the no-go evidence                                                                      | `docs/sponsors/ZERO-G-NO-GO.md`                                                          |

Workstreams may run in parallel only after the shared protocol contracts they
consume are merged or pinned to an integration commit.

## Gates

### G0 - repository foundation

Pass when:

- Classic-track provenance is committed;
- product, architecture, claims, threat model, ADRs, contribution rules, and
  session protocol are reviewed;
- the exact runtime and package manager are pinned;
- every deployable parses the same fail-closed runtime contract;
- the responsive synthetic control-room preview passes desktop and mobile
  inspection;
- CI validates formatting, types, tests, build, secrets, and dependency policy;
  and
- the public remote and branch rules exist.

### G1 - canonical AP and action kernel

Pass when:

- source observation, canonical invoice, payment action, supplier, and standing
  mandate schemas are versioned;
- ingestion is idempotent and duplicate classification is deterministic;
- extracted or model-proposed fields remain candidates until independently
  reconciled;
- invoice input cannot mutate a supplier master or mandate;
- the exact integer amount, asset, network, beneficiary, invoice digest, and
  expiry enter one immutable payment action;
- RFC 8785/SHA-256 known vectors and field-mutation property tests pass;
- state-machine tests prohibit invalid transitions and second settlement; and
- no sponsor SDK dependency exists in the domain or protocol packages.

### G2 - deterministic routing and authority

Pass when:

- every invoice is exactly `STRAIGHT_THROUGH`, `HUMAN_APPROVAL`, or `BLOCK`;
- straight-through requires exact containment by a current, unrevoked standing
  mandate plus an independently confirmed structured source;
- unstructured extraction alone can never authorize payment;
- exceptions freeze before decisions are collected;
- approving an exception never updates supplier data;
- role, amount, asset, supplier, beneficiary, evidence, time, and frequency caps
  are enforced again at execution; and
- policy reason codes are exhaustive and visible in the product.

### G3 - World live authority

Pass when:

- company payment agents are registered through the documented AgentKit flow;
- an action inside a standing mandate is demonstrably backed by a
  company-authorized agent without artificial per-invoice approval ceremony;
- exception decisions bind the exact action, role, subject, decision, and
  expiry;
- same-human delegates cannot satisfy distinct approval slots;
- missing, expired, revoked, replayed, or wrong-action authority fails;
- raw human identifiers are absent from logs and public evidence; and
- the evidence record cites package, network, transaction or registration
  references, commit, and first-party documentation.

If the required real-human fixture cannot be exercised, the product does not
claim the corresponding distinct-human property.

### G4 - Hedera x402 evidence

Pass when:

- the verifier returns HTTP 402 for the exact supplier-evidence resource;
- the worker creates the exact requested Hedera Testnet payment;
- consensus is awaited before the evidence result is released;
- `MATCH` means only that the submitted payment details match the verifier's
  cited source, not that the real-world bank account is owned by the supplier;
- the signed result binds the action, evidence, expiry, and service-payment
  transaction;
- wrong amount, recipient, digest, result, signature, expiry, or substituted
  response fails; and
- transaction and Mirror or HashScan evidence are exported.

### G5 - exact settlement and recovery

Pass when:

- the settlement account is separate and capped;
- the demo asset is explicitly selected and labelled before the action freezes;
- the worker validates exact recipient, integer amount, asset, network, memo,
  digest, authorization evidence, and expiry before signing;
- queueing the frozen attempt and initial submission request is one atomic
  transition, so first submission is never inferred by polling;
- the same frozen transaction is reconciled after an uncertain submit;
- crash-before-submit, crash-after-submit, timeout, and retry tests yield at
  most one transfer;
- consensus receipt, one-use consumption, mandate settlement, and the
  deterministic execution-audit request commit atomically;
- execution audit exposes pending and degraded states, retries the same event
  ID, and recovers without undoing or repeating value;
- mutation and replay show no second movement; and
- HCS and Mirror evidence are linked without being presented as external truth.

### G6 - full product movie

Pass when:

- the live deployment uses no required fake adapter;
- the 100-invoice batch visibly resolves into 86 straight-through, 12 review,
  and 2 blocked records;
- the desktop control room, focused mobile approval, paid verification,
  settlement, adversarial evidence, and audit bundle form one coherent
  responsive web application;
- one untouched build succeeds ten consecutive times;
- the four-minute script finishes with at least 15 seconds of margin;
- a neutral viewer can retell the business problem and why each sponsor is
  necessary;
- two target users give structured feedback; and
- World and Hedera engineers have seen the red path or answered the exact
  implementation questions.

## Frozen scope decision: 0G

The 2026-07-25 review failed the private testnet model, authenticated E2EE, and
exact proof-binding requirements. No 0G implementation PR is scheduled. World
and Hedera remain the complete submission.

### G7 - submission

Pass when:

- the repository is public and auditable;
- the live deployment and source resolve to the same commit;
- the README includes setup, architecture, invoice and payment flows, sponsor
  code pointers, synthetic-data labels, and limitations;
- sponsor feedback and evidence requirements are complete;
- videos meet every duration limit;
- the project page contains screenshots and exact selected-prize explanations;
- no secret or sensitive stable identifier appears in repository, CI, logs,
  video, or evidence; and
- a clean machine reproduces the documented path.

## Pull-request sequence

|  PR | Branch                     | Outcome                                                                     | Depends on        |
| --: | -------------------------- | --------------------------------------------------------------------------- | ----------------- |
|   1 | `chore/foundation`         | Governance, architecture, strict workspace, CI, runtime-safe product shell  | provenance commit |
|   2 | `feat/ap-domain-contracts` | AP schemas, action core, policy decision, state machines, hashes, reasons   | PR 1              |
|   3 | `feat/invoice-operations`  | Persistence, intake, normalization, matching, duplicates, routing, fixtures | PR 2              |
|   4 | `feat/control-room`        | Queue, invoice workspace, policy trace, mobile approval, reconciliation UI  | PR 2              |
|   5 | `spike/world-authority`    | Live AgentKit routine path and Human-in-the-Loop exception fixtures         | PR 2              |
|   6 | `spike/hedera-x402`        | Paid evidence service, HTS asset spike, consensus and receipt evidence      | PR 2              |
|   7 | `feat/hedera-settlement`   | HCS precommit, signing guard, exact settlement, outbox and recovery         | PR 6              |
|   8 | `feat/product-integration` | Connect operations, World, Hedera, UI, reconciliation, and audit export     | PRs 3-7           |
|   9 | `test/live-product-path`   | Full E2E, ten-run reliability, crash and adversarial suite                  | PR 8              |
|  10 | `docs/submission`          | Final docs, sponsor feedback, evidence, video, deployment manifest          | PR 9              |

PRs 3 through 6 may run concurrently in isolated worktrees from the same pinned
PR 2 integration commit. PR 4 consumes typed projection fixtures so sponsor
spikes do not block product work. PR 7 must not begin from undocumented
assumptions about PR 6's transaction lifecycle.

## Definition of vertical-slice complete

The first technical slice proves the spine that the full product will use:

1. one structured recurring invoice routes under a valid standing mandate;
2. one changed-beneficiary invoice freezes and requires the configured roles;
3. World authority for each route binds the same action;
4. the Hedera evidence service payment reaches consensus;
5. the signed response binds the same action;
6. exact settlement occurs once; and
7. duplicate, mutation, and replay attempts do not move value.

The full control room is built on this spine, never instead of it.

## Integration cadence

- Rebase active branches at a declared integration point.
- Merge shared protocol changes before adapter implementations depend on them.
- Run the full quality suite after each merge.
- Run protected live tests after sponsor or transaction changes.
- Update the build log, sponsor questions, claims, and session handoff.
- Keep a known-green demo SHA and deployment while new work continues.

## Decision ownership

- Product and claims: product lead.
- Invoice domain and security invariants: architecture owner.
- Sponsor behavior: integration owner with first-party evidence.
- Financial key, asset, and network changes: two-person review.
- Demo and submission: demo owner plus architecture sign-off.
- Reopening 0G: explicit architecture review, not developer discretion.
