# Sponsor engagement plan

Sponsor interaction is an engineering feedback loop, not a request for judges to
endorse the project.

## Working method

For each interaction:

1. reproduce the behavior against a pinned release;
2. ask one narrow question with the observed version, network, and result;
3. link a minimal public reproduction or source line when safe;
4. record who answered, where, when, and whether the guidance is documented or
   informal;
5. turn material guidance into a test, ADR, limitation, or issue; and
6. follow up with the resolved implementation and thank the engineer.

Do not ask sponsors to debug an unreviewed code dump. Do not treat a Discord or
in-person answer as a guarantee of eligibility.

## World questions

### W01 - strict approval binding

> We are pinning `@worldcoin/agentkit@0.2.0`. Its released validator checks the
> expected domain and URI host/port, but our source review does not find exact
> path, resource, HTTP method, or advertised chain/type enforcement. For a
> payment-approval route, is the intended integration to add those checks after
> low-level validation, and is there a newer released helper we should exercise?

Evidence to bring: one passing exact challenge and one path-substitution
negative test.

### W02 - privacy-safe same-human evidence

> We need to demonstrate that A1 and A2 resolve to the same AgentBook human
> without publishing the stable `humanId` or its company mapping. Is a redacted
> “same registered human” timeline plus registration transaction references the
> presentation you recommend?

### W03 - registration fixture

> We plan to pre-register A1/A2 with one World ID human and B with another on
> canonical AgentBook. Are there any event-specific registration or evidence
> constraints beyond the released CLI and World Chain status check?

### W04 - AgentBook and action-time human relationship

> We require both an AgentKit-backed approval delegate and a Human-in-the-Loop
> proof bound to the exact payment action. The current interfaces give us an
> AgentBook human identifier and a separate action-scoped IDKit nullifier. Is
> there a supported privacy-preserving way to prove that the same person
> controls both, or should we continue treating them as independent facts?

Evidence to bring: one exact action with delegate evidence, HITL proof metadata,
and the deliberately bounded product claim.

### W05 - standing-mandate agent boundary

> Our routine path lets a company-enrolled payment agent act without per-invoice
> HITL only when deterministic policy proves exact containment by a separately
> governed standing mandate. We still re-resolve AgentBook, verify the company
> role, and require the agent's digest-bound signature immediately before
> settlement. Is that the AgentKit accountability boundary you would expect for
> autonomous payments, with HITL reserved for policy exceptions?

Evidence to bring: one routine action admitted by a current mandate and the same
action refused after beneficiary or cap mutation.

## Hedera questions

### H01 - x402 2.19 upgrade

> The official scaffold locks x402 2.13.2/core 2.14.0, while we are testing
> `@x402/hedera@2.19.0` with the new payer-signature and preflight callbacks. Is
> our expected flow—verify exact transfer and memo, settle, then release only
> after `SUCCESS` receipt—the current recommended path?

Evidence to bring: invalid payer signature rejected before submit and a
successful Testnet receipt.

### H02 - Agent Kit planning boundary

> We use one custom Agent Kit v4 `RETURN_BYTES` tool whose only model-visible
> input is the approved action digest. A deterministic guard then decodes,
> checks, signs, and submits the exact transaction. Does that demonstrate
> meaningful Agent Kit usage without incorrectly treating `RETURN_BYTES` success
> as consensus?

### H03 - HCS and judge evidence

> We use an explicit HCS `authorization.v1` receipt as a fail-closed precommit
> for either a standing mandate or exception quorum and retry `execution.v1`
> after settlement with a stable event ID. Which receipt and Mirror fields would
> you most want judges to see in the four-minute evidence view?

### H04 - exact fiat-denominated Testnet fixture

> Our source invoice is denominated in EUR, so we will not relabel a small HBAR
> transfer as that invoice payment. For an exact no-value Testnet
> representation, would you recommend an ordinary allowlisted HTS fungible demo
> token, Stablecoin Studio sandbox token, or an HBAR-denominated fixture? We
> need Agent Kit to return the planned token-transfer bytes and our
> deterministic guard to validate the token ID, accounts, atom amount, and memo
> before signing.

Evidence to bring: decoded frozen bytes for one exact allowlisted token transfer
and a wrong-token negative test.

## 0G question

### Z01 - admission blocker

> Our 2026-07-25 testnet review found no acknowledged decentralized private chat
> provider that can support the supplier-evidence flow, and the current E2EE
> implementation does not yet attest or authenticate the broker key and
> response. Is there a released testnet surface that closes both gaps? If not,
> we will not select 0G rather than claim unverifiable private compute.

This question validates the no-go decision; it is not permission to use mainnet.

## Interaction log

| ID  | Date/time | Channel/person       | Evidence shared | Answer  | Classification | Resulting artifact |
| --- | --------- | -------------------- | --------------- | ------- | -------------- | ------------------ |
| W01 | pending   | World booth/Discord  | pending         | pending | pending        | pending            |
| W02 | pending   | World booth/Discord  | pending         | pending | pending        | pending            |
| W03 | pending   | World booth/Discord  | pending         | pending | pending        | pending            |
| W04 | pending   | World booth/Discord  | pending         | pending | pending        | pending            |
| W05 | pending   | World booth/Discord  | pending         | pending | pending        | pending            |
| H01 | pending   | Hedera booth/Discord | pending         | pending | pending        | pending            |
| H02 | pending   | Hedera booth/Discord | pending         | pending | pending        | pending            |
| H03 | pending   | Hedera booth/Discord | pending         | pending | pending        | pending            |
| H04 | pending   | Hedera booth/Discord | pending         | pending | pending        | pending            |
| Z01 | pending   | 0G booth/Discord     | pending         | pending | pending        | pending            |

Classify an answer as `first-party documented`, `first-party informal`,
`observed live`, or `unverified`. Never silently rewrite a row after the fact;
add the new evidence and link the implementing commit.
