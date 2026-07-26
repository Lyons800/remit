# InvoiceGuard

InvoiceGuard is an agentic accounts-payable operations system with an
exact-action authorization engine. It gives a finance team one place to receive,
check, approve, pay, and reconcile supplier invoices.

The problem is concrete: paying even ten suppliers at our Lisbon padel club
already means scattered invoices, copied bank details, slow approvals, and
awkward payment screens. At enterprise scale, that becomes hundreds or thousands
of invoices. InvoiceGuard lets agents clear repetitive work under narrow
standing mandates and sends material exceptions to people.

An invoice or model may propose payment fields, but neither can authorize money.
InvoiceGuard reconciles the candidate against supplier records and policy,
freezes one exact action, purchases any required evidence check, and either
executes within an approved mandate or collects fresh, action-bound human
decisions. Only the unchanged request can settle, once.

## Status

Active build for ETHGlobal Lisbon 2026.

- Track: Classic / From Scratch
- Target partner surfaces: World AgentKit, World Human-in-the-Loop, and Hedera
- World evidence: the offline AgentKit, AgentBook, IDKit request, and
  whole-bundle authority-admission contract are implemented; live World
  authority remains a NO-GO until the authenticated persistence gates in
  [the spike record](docs/sponsors/WORLD-SPIKE.md) pass
- 0G admission: rejected on 2026-07-25; no suitable testnet private,
  authenticated text-inference path is currently available
- Financial operations: Hedera Testnet only
- Identity exception: AgentBook registration and lookup use World Chain
  `eip155:480`

InvoiceGuard does not detect deepfakes or prove caller identity, employment,
beneficiary ownership, or the truth of external evidence.

## Development

Requirements:

- Node.js `24.11.0`;
- pnpm `11.17.0` through Corepack; and
- no live financial or sponsor credentials for the foundation build.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Development loads the safe defaults in `.env.example` and then an optional
uncommitted `.env`. The foundation services run with sponsor adapters
`inactive`; `/livez` reports process liveness and `/readyz` deliberately returns
503 until the owning integration is implemented. No payment path is active.

| Process           | Local port |
| ----------------- | ---------: |
| Web               |       3000 |
| Control API       |       4100 |
| Extraction worker |       4150 |
| Verifier          |       4200 |
| x402 facilitator  |       4300 |
| Payment agent     |       4400 |
| Settlement worker |       4500 |

Run the complete local quality gate before every push:

```bash
pnpm check
```

## Provenance

Project-specific work began in this repository during ETHGlobal Lisbon 2026. See
[HACKATHON_PROVENANCE.md](HACKATHON_PROVENANCE.md).

## License

Apache-2.0.
