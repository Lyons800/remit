# ADR 0005: 0G admission gate

- Status: accepted admission policy; current admission rejected
- Date: 2026-07-25

## Context

The rules allow three selected partners, but a third integration can dilute the
World and Hedera story. 0G is coherent only if it replaces the existing
beneficiary-check compute.

## Decision

Do not install or select 0G until World and Hedera pass their core live gates.
Admit 0G only when:

1. encrypted synthetic supplier evidence enters real Private Computer;
2. no local or public fallback exists;
3. verifiable provider output is retained;
4. the output binds evidence root, action digest, result, and expiry;
5. `MATCH`, `MISMATCH`, and `UNKNOWN` change deterministic authorization;
6. Hedera pays for that same service;
7. the path succeeds ten consecutive times; and
8. it adds no more than 30-40 seconds to the main demo.

## Consequences

- The domain exposes a verifier port that both deterministic and 0G-backed
  implementations can satisfy.
- Live 0G failure returns `UNKNOWN` and stops settlement.
- A model call without real private/verifiable evidence does not qualify.
- If any gate fails, the project submits World and Hedera only.

## Current admission record

Rejected on 2026-07-25:

- the live 0G testnet catalog has no suitable private `TeeML` chatbot;
- usable private text models are on 0G mainnet, which would add an unreviewed
  funded network, credential, and incident-response boundary;
- first-party `0g-pc-e2ee` has no tagged release and explicitly lacks
  attestation and response-signature verification;
- its broker encryption key is not attestation-bound, so a malicious Router can
  substitute a key; and
- the released TypeScript SDK verifies a signer but does not establish the exact
  request/output binding CallGuard claims.

The project selects World and Hedera only. No 0G adapter package, SDK,
credential, or deployment exists. Reconsideration requires every gate in
`docs/sponsors/ZERO-G-NO-GO.md`.

## Rejected alternatives

- Sending the transcript to 0G as an unrelated summary step.
- Silent fallback to a local or public model.
- Adding Uniswap, Sui, The Graph, ENS, or 1inch solely to fill a sponsor slot.
