# Hedera dual-token atomic settlement — live evidence

Checked: 2026-07-26.

Implementation: `96839de28a0b34f76a2d9674044aaebcc5fd2f37`.

This is a real Hedera Testnet mechanism proof using synthetic, no-value assets.
It is not evidence of a fresh World/x402 authorization, legal KYC, legal
assignment of a receivable, production custody, or production replay control.
The Control metadata and every HCS event identify the run as
`MECHANICS_FIXTURE`.

## Public entities

| Entity              | Public evidence                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Action digest       | `b2642183952e8519a0d4bb26ddc1c696f502b67f91250a254c1e00067bbbac08`                              |
| Settlement asset    | [`RMEURT 0.0.9764805`](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.9764805)         |
| Audit topic         | [`0.0.9764806`](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.9764806/messages)       |
| Payable NFT         | [`RMPAY 0.0.9764807#1`](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.9764807/nfts/1) |
| Control NFT         | [`RMCTL 0.0.9764808#1`](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.9764808/nfts/1) |
| Settlement manifest | `54f6312cc5b4dfb1f058b494448e30fea998645174871c7298babc701c9e40ad`                              |

Mirror reports `RMEURT` as a finite fungible token with two decimals, initial,
total and maximum supply of 48,000 atoms, and no admin, supply, freeze, KYC,
pause, wipe, fee-schedule or metadata key. Its custom-fee lists are empty.

Both NFT collections have finite maximum supply 1,000, default freeze, separate
supply/KYC/freeze/pause keys, and no admin/wipe/fee-schedule/metadata keys or
custom fees. Their one serial is now deleted and each collection's total supply
is zero.

## Rollback proof

[Atomic batch `0.0.9708355@1785051992.337954908`](https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.9708355-1785051992-337954908)
reached consensus as `INNER_TRANSACTION_FAILED`.

| Order | Inner transaction                 | Consensus result   |
| ----: | --------------------------------- | ------------------ |
|     1 | Control unfreeze                  | `REVERTED_SUCCESS` |
|     2 | Settlement-token and NFT transfer | `REVERTED_SUCCESS` |
|     3 | Payable burn                      | `REVERTED_SUCCESS` |
|     4 | Deliberately invalid Control burn | `INVALID_NFT_ID`   |

There is no HCS child. The runner also reconciled the outer receipt, confirmed
the Control relationship remained frozen, and re-read unchanged claimant
balance, NFT state and HCS sequence. Processed transaction fees are not rolled
back.

Before the dedicated failure harness submitted this negative test, the
signed-wire verifier rejected its deliberately incorrect Control burn serial.

## Successful atomic settlement

[Atomic batch `0.0.9708355@1785052000.077747014`](https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.9708355-1785052000-077747014)
reached consensus as `SUCCESS`.

| Order | Inner transaction                               | Consensus result |
| ----: | ----------------------------------------------- | ---------------- |
|     1 | Control unfreeze                                | `SUCCESS`        |
|     2 | Exact 48,000-atom payment plus both NFT returns | `SUCCESS`        |
|     3 | Payable burn                                    | `SUCCESS`        |
|     4 | Control burn                                    | `SUCCESS`        |
|     5 | HCS mechanics settlement commitment             | `SUCCESS`        |

The claimant account
[`0.0.9758583`](https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.9758583/tokens?token.id=0.0.9764805)
holds exactly 48,000 `RMEURT` atoms. Both NFT records are `deleted=true` with no
owner account.

The runner independently decoded every signed outer-node candidate before
submission using pinned Hedera protobuf definitions. It admitted the batch only
after matching the exact operation bodies, accounts, amount, asset, token IDs,
serials, topic, message, outer and inner transaction IDs, validity duration,
batch key and exact cryptographically valid signer sets, with no allowances or
extra operations.

## HCS order and receipt reference

Topic `0.0.9764806` has exactly:

1. `authorization-fixture.v2`, binding the action, evidence, token serials,
   holder-set commitment and settlement-plan hash;
2. atomic `mechanics-settlement-commitment.v2`, committed as the fifth inner
   transaction; and
3. post-consensus `mechanics-execution.v2`, submitted by
   [`0.0.9708355@1785052002.473916821`](https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.9708355-1785052002-473916821).

All three carry `authorityMode: "MECHANICS_FIXTURE"`. The execution event binds
the batch ID, consensus timestamp, manifest, `SUCCESS` receipt status, Hedera
SHA-384 transaction hash and a separately labelled SHA-256 hash of the
serialized transaction list. It is receipt-referencing, not part of the atomic
batch and not adapter-verified.

## Gate result

- 26 test files and 506 tests passed.
- Formatting, lint, workspace type checks, test/script type checks and all 14
  workspace builds passed.
- ADR 0011 keeps this path at production `NO-GO`.
