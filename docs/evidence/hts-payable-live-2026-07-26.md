# Live HTS lifecycle marker (Hedera Testnet)

## Audited committed runner

Run: 2026-07-26 05:48 WEST · code snapshot `801923b` · operator `0.0.9708355` ·
`--simulate-humans` (the HTS operations and Mirror checks were live; World
identities were explicitly simulated).

| Step                        | Public fact                                                                                                                       | Proof                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Sealed collection created   | `0.0.9762937`, `Remit Payable Markers - NO VALUE`, `RMPAY`, NFT, finite supply `1`, supply key only                               | [transaction](https://hashscan.io/testnet/transaction/0.0.9708355-1785041294-342974356)     |
| Marker minted               | serial `1`; metadata is canonical action digest `8dfc4f58375b0b57e4fbb296732c83e55e61f1c7ce94dea0e0994c1a290f5d1d`                | [transaction](https://hashscan.io/testnet/transaction/0.0.9708355-1785041298-535173099)     |
| Configuration read back     | treasury `0.0.9708355`; admin, wipe, freeze, KYC, fee-schedule, metadata and pause keys absent; no custom fees                    | [Mirror token record](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.9762937)      |
| Metadata and burn confirmed | historical serial retains the exact digest; `deleted: true`, `account_id: null`, collection `total_supply: 0` and `max_supply: 1` | [Mirror NFT record](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.9762937/nfts/1) |
| Lifecycle burn submitted    | the supply-key-authorized NFT burn reached consensus                                                                              | [transaction](https://hashscan.io/testnet/transaction/0.0.9708355-1785041302-248047264)     |

The runner fails if Mirror returns a different treasury, supply key, token type,
supply mode, digest, lifecycle state, management key or fee configuration. This
run proves the committed create/configure/mint/read/burn path. It does not prove
live World identities, supplier settlement for the beneficiary-changing action,
legal assignment of a receivable, tax compliance, payment authority, or replay
prevention.

## Earlier protocol spike (historical)

Run: 2026-07-26 01:13 WEST · operator `0.0.9708355` · one uninterrupted
execution.

| Step                 | Public fact                                                                                                    | Proof                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Collection created   | `0.0.9757606`, `InvoiceGuard Payables - NO VALUE`, `IGPAY`, non-fungible                                       | [transaction](https://hashscan.io/testnet/transaction/0.0.9708355-1785024779-350224287)     |
| Marker minted        | serial `1` to treasury `0.0.9708355`                                                                           | [transaction](https://hashscan.io/testnet/transaction/0.0.9708355-1785024779-021457816)     |
| Metadata read back   | deleted NFT history retains `0x5ce4f3cab7795c09c884da51e693661810b11cc4a03d660c1a77a443d017de89` byte-for-byte | [Mirror NFT record](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.9757606/nfts/1) |
| Marker burned        | serial `1` moved from treasury to the burn sink; the historical NFT record now reports `deleted: true`         | [transaction](https://hashscan.io/testnet/transaction/0.0.9708355-1785024788-043989723)     |
| Collection inspected | total supply `0`; supply key present; admin, wipe, metadata, freeze, KYC, fee-schedule, and pause keys absent  | [Mirror token record](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.9757606)      |

The public Mirror records independently prove token creation, mint, historical
metadata, burn, and the collection's key configuration.

They do not prove that the marker:

- used InvoiceGuard's canonical payment-action digest, which is an unprefixed
  lowercase 64-character hexadecimal string;
- authorized or executed a supplier payment;
- was atomically coupled to settlement;
- prevented a payment replay; or
- ran through code committed to the assembled product.

The experimental runner named `gate-hts-live.ts` was not committed. The
prototype package expected a third digest form, `sha256:<hex>`, and therefore
could not validate this run's `0x<hex>` metadata under the canonical AP
contract. The package is intentionally excluded from the payment authority path.
This evidence remains useful as a real HTS lifecycle spike only.
