# Live evidence — HTS payable token lifecycle (Hedera Testnet)

Run: 2026-07-26 01:13 WEST · operator 0.0.9708355 · one uninterrupted execution.

| Step | Fact | Proof |
|---|---|---|
| Collection created | `0.0.9757606` — "InvoiceGuard Payables - NO VALUE" (IGPAY, NFT) | [tx](https://hashscan.io/testnet/transaction/0.0.9708355-1785024779-350224287) |
| Payable minted | serial 1, metadata = action digest `0x5ce4f3cab7795c09c884da51e693661810b11cc4a03d660c1a77a443d017de89` | [tx](https://hashscan.io/testnet/transaction/0.0.9708355-1785024779-021457816) |
| Mirror read-back | metadata on ledger MATCHES the digest (validated by plan→evidence code, not by the submitting client) | mirror `/tokens/0.0.9757606/nfts/1` |
| Payable burned | serial 1 consumed — the authorization no longer exists on the ledger | [tx](https://hashscan.io/testnet/transaction/0.0.9708355-1785024788-043989723) |

Demonstrates: token creation + configuration + two lifecycle operations
(mint, burn) on the invoice asset class, with consumption as a ledger fact.
Produced by `gate-hts-live.ts`; validation logic is
`packages/hedera-payable-token` (branch `hts-payable-token`).
