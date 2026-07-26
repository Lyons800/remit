# ADR 0010: Use HTS as an operational payable marker

- Status: accepted
- Date: 2026-07-26

## Context

The Hedera Tokenization prize explicitly names invoices and favours meaningful
compliance or lifecycle management. That does not make an HTS token the invoice,
the receivable, or the legal mechanism that assigns a receivable.

In the EU, an electronic invoice is structured business data governed by the EN
16931 semantic model and its syntax bindings. In Portugal, the ATCUD remains the
fiscal document identifier. Assignment of a receivable belongs to a separate
factoring and secured-transactions legal regime. A token cannot create those
legal effects merely by referring to an invoice.

Publishing invoice fields, an ATCUD, a supplier, an amount, or a beneficiary on
a public ledger would also create an unnecessary privacy and commercial-data
exposure. The EDPB recommends keeping additional personal data off-chain and
warns that even hashes can remain personal data when linkable.

Remit already has a canonical, domain-separated action digest. The underlying
action contains a random 128-bit nonce and binds the exact invoice revision,
obligation, supplier snapshot, amount, asset, beneficiary, policy and expiry. It
is therefore suitable as a compact commitment to an already-authorized
operational action without publishing those fields.

## Decision

Remit's HTS NFT is a **no-value operational payable marker**:

- it represents one canonical payment action for audit demonstration;
- it does not represent the invoice document, ownership of a receivable, payment
  authority, legal assignment, tax compliance, or settlement;
- its metadata is exactly the unprefixed lowercase 64-hex action digest;
- raw invoice data, supplier identifiers, amounts, beneficiaries, tax
  identifiers, ATCUDs and document URLs stay off-chain;
- the NFT remains in the treasury account and is not offered or transferred;
- the demo collection is finite-supply one and has a supply key only;
- admin, wipe, freeze, KYC, fee-schedule, metadata and pause keys are omitted;
- Mirror Node must confirm the exact collection configuration, metadata, mint
  state and burned state before the demo states those facts; and
- burn is described only as an HTS lifecycle operation. It is not described as
  payment, action consumption, receivable discharge, or replay prevention.

The demo creates one collection per run because creation and configuration are
explicit prize requirements. That is not a production topology decision. A
production design would normally evaluate one collection per organization and
one serial per action, together with retention, cost, privacy, key custody and
DPIA requirements.

KYC, freeze, pause and custom-fee keys are not added for optional-prize points.
They have no purpose while the marker remains in treasury and would enlarge the
issuer's authority surface. A production supply key must move from the Testnet
operator key to an isolated threshold or managed signing boundary.

The marker stays outside the settlement authorization path. Coupling a future
mint or burn to settlement would require a separate ADR, state-machine changes,
recovery tests and a live proof. HIP-551 atomic batches may be evaluated then,
but are not implied by this decision.

## Consequences

- The HTS lifecycle is reproducible and publicly auditable without overstating
  what it proves.
- Omitting the admin key seals the collection configuration and prevents token
  update or deletion through that authority.
- The supply key remains capable of mint and burn, so the marker is evidence,
  not an independent one-use control.
- The public action digest is still a persistent identifier. Its nonce reduces
  guessing risk, but production use still requires a documented lawful basis,
  retention analysis and DPIA where applicable.
- The canonical invoice and fiscal identifiers remain in the off-chain record
  and can evolve toward EN 16931/UBL/CII ingestion independently of HTS.
- Transferable-invoice or factoring features remain out of scope until legal
  assignment, debtor notice, priority, custody, jurisdiction and privacy are
  designed explicitly.

## First-party sources

- [ETHGlobal Lisbon 2026 Hedera prize criteria](https://ethglobal.com/events/lisbon2026/prizes/hedera)
- [Hedera token-create keys and immutable-token semantics](https://docs.hedera.com/reference/protobuf/token/tokencreate)
- [Hedera NFT mint metadata and signing requirements](https://docs.hedera.com/native/tokens/mint)
- [Hedera Mirror token response](https://docs.hedera.com/api-reference/tokens/get-token-by-id)
- [EU EN 16931 eInvoicing documentation](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108931/Navigating+the+eInvoicing+standard+documentation)
- [Portuguese Tax Authority ATCUD guidance](https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/questoes_frequentes/pages/faqs-00883.aspx)
- [EDPB blockchain data-protection guidelines, version 2.0](https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_202502_blockchain_v2_en.pdf)
- [UNIDROIT Model Law on Factoring](https://www.unidroit.org/instruments/factoring/model-law-on-factoring/)
