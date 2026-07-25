# InvoiceGuard

InvoiceGuard is the accounts-payable workflow built on CallGuard's exact-action
authorization engine. It stops a changed supplier payout instruction from
becoming an unreviewed agent payment.

An accounts-payable agent may extract and propose an invoice action, but it
cannot authorize one. InvoiceGuard freezes the exact request, checks the backing
and role of each approval delegate, collects action-bound decisions from
distinct people, and allows only the unchanged request to settle once.

## Status

Active build for ETHGlobal Lisbon 2026.

- Track: Classic / From Scratch
- Core partner integrations: World AgentKit, World Human-in-the-Loop, and Hedera
- 0G admission: rejected on 2026-07-25; no suitable testnet private,
  authenticated text-inference path is currently available
- Financial operations: Hedera Testnet only
- Identity exception: AgentBook registration and lookup use World Chain
  `eip155:480`

InvoiceGuard does not detect deepfakes or prove caller identity, employment,
beneficiary ownership, or the truth of external evidence.

## Provenance

Project-specific work began in this repository during ETHGlobal Lisbon 2026. See
[HACKATHON_PROVENANCE.md](HACKATHON_PROVENANCE.md).

## License

Apache-2.0.
