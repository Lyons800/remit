# Remit

**Let agents pay the invoices. Prove they paid the right thing.**

ETHGlobal Lisbon 2026 · Classic track ·
[invoiceguard-hq.vercel.app](https://invoiceguard-hq.vercel.app)

---

## The problem

I run a padel club in Portugal. We get a lot of supplier invoices, and they are
a pain — to manage, to approve, to check line by line, and to actually pay. The
same job at a large company runs to hundreds or thousands of invoices a month.

Agents should obviously be doing this work. So why aren't they?

**It is not AI capability.** Models read invoices fine.

The blocker is **authorisation**. No finance director lets an agent pay a
thousand invoices a month unless the control survives the agent being wrong,
confused, or compromised. Today's controls cannot survive it.

Every company will tell you it has a control: _two people must approve_. Ask
what that actually verifies and it falls apart. It verifies that **two accounts
clicked approve** — not that two _people_ did, not that they approved _this_
payment rather than one edited afterwards, and not that the thing paid is the
thing approved. That control was designed for a human in a browser. Point an
agent at it and a second "independent" approver costs one `new Wallet()`.

## What it does

Every payment request becomes **one exact identifier** — supplier, current
account, proposed account, amount, purpose, expiry, nonce — hashed into a single
digest. That digest _is_ the payment, not a description of it. Then the work
splits the way a finance director actually would:

|             |                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| **The 990** | Known supplier, unchanged account, within tolerance → the agent settles it unattended. Nobody is asked anything. |
| **The 10**  | Anything that changes where money can go → escalates and demands **two provably distinct humans**.               |

## Architecture

```
                    ┌──────────────────────────────────────────┐
   invoice ────────▶│ packages/protocol                        │
                    │   canonical action (12 fields, Zod)      │
                    │   digestCanonicalValue → action digest   │
                    │   evaluatePaymentPolicy → route          │
                    └───────────────┬──────────────────────────┘
                                    │
                 STRAIGHT_THROUGH ◀──┴──▶ HUMAN_APPROVAL
                         │                      │
                         │                      ▼
                         │        ┌─────────────────────────────┐
                         │        │ packages/domain             │
                         │        │   validateApprovalQuorum    │
                         │        │   counts distinct HUMANS    │
                         │        └──────────┬──────────────────┘
                         │                   │ resolves via
                         │                   ▼
                         │        ┌─────────────────────────────┐
                         │        │ packages/world-adapter      │
                         │        │   AgentKit / AgentBook      │
                         │        │   agent wallet → humanId    │
                         │        │   World Chain eip155:480    │
                         │        └──────────┬──────────────────┘
                         │                   │
                         ▼                   ▼
                    ┌──────────────────────────────────────────┐
                    │ Hedera Testnet                            │
                    │   x402 paid verification (crypto service) │
                    │   supplier payment    (crypto service)    │
                    │   audit marker        (token service)     │
                    └───────────────┬──────────────────────────┘
                                    ▼
                    ┌──────────────────────────────────────────┐
                    │ packages/persistence (Postgres/Neon)      │
                    │   payment_actions, approval_facts,        │
                    │   workspace_people — scoped by org        │
                    └──────────────────────────────────────────┘
```

**Three facts are kept deliberately separate and never conflated:**

1. **Human backing** — _is a unique human behind this agent?_ → World AgentKit
2. **Company role** — _is that person your treasurer?_ → the company's own
   issuer
3. **Action permission** — _may this proceed unattended?_ → policy over the
   digest

World tells you someone is a distinct person. It does **not** tell you their
job. Conflating those is how you build a control that looks rigorous and isn't.

## Payment flow mechanics

A beneficiary-changing invoice, end to end:

1. **Freeze.** The request is parsed into `PaymentActionCoreV1` and hashed with
   `digestCanonicalValue` under a domain separator. Change one character of the
   IBAN and the digest changes, which voids every approval bound to it.
2. **Route.** `evaluatePaymentPolicy` returns `STRAIGHT_THROUGH` or
   `HUMAN_APPROVAL` with a required quorum. A changed beneficiary withdraws the
   standing mandate, so the route becomes `HUMAN_APPROVAL` with
   `actionHumanQuorum: 2`.
3. **Collect approvals.** Each approver's agent wallet is resolved against
   AgentBook to an anonymous `humanId` **at approval time**. The mapping is
   never stored — a cached agent→human would let anyone who reached our database
   manufacture a quorum.
4. **Count humans, not accounts.** `validateApprovalQuorum` groups by
   `actionHumanPrincipal`. Two wallets backed by one person collapse to one vote
   and the surplus is reported as `ACTION_HUMAN_NOT_DISTINCT`.
5. **Buy the evidence.** The agent requests a beneficiary check and receives
   `402 Payment Required`. It signs an exact-scheme payload; a facilitator
   verifies the payer signature on-chain and settles real HBAR after consensus.
   **The agent pays the price; the facilitator absorbs the network fee** — the
   agent is a paying customer, not a gas payer. The answer is signed over
   _(digest, result, payment tx)_, so it cannot be lifted onto another invoice.
6. **Keep the payment claim exact.** Act 1 executes a separate routine supplier
   payment as a native HBAR transfer. The beneficiary-changing action proves
   approval and paid verification, but the current demo does not claim its
   supplier settlement is adapter-bound.
7. **Publish a marker.** The approved action digest is minted as a no-value,
   treasury-held HTS NFT, its configuration and metadata are read back from
   Mirror Node, and it is burned as an explicit lifecycle operation. The marker
   is not the invoice, a receivable, payment authority, or settlement.

Routine invoices skip steps 3–5 entirely: the agent pays them directly.

## Hedera integration

**JS/TS SDK only. No Solidity. No smart contracts deployed.**
`git ls-files '*.sol'` returns nothing.

Three native Hedera services, matching the track's own examples:

| Service            | Where it is used                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Token Service**  | no-value operational marker — `TokenCreateTransaction` (NFT, finite supply 1, supply key only) → `TokenMintTransaction` with the action digest → `TokenBurnTransaction` |
| **Mirror Node**    | the collection's key surface, digest metadata, mint and burn are independently read back before the demo states them                                                    |
| **Cryptocurrency** | a routine supplier payment (`TransferTransaction`) and x402 settlement of the verification fee                                                                          |

That is token **creation**, **configuration**, and **two lifecycle operations**.

## Proven live

Executed against real networks and verified by reading it back from Mirror Node,
not from our own call:

| Claim                                | Evidence                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Agent pays for verification via x402 | [`0.0.9758618-1785026905-665197442`](https://hashscan.io/testnet/transaction/0.0.9758618-1785026905-665197442)     |
| Three-party economics                | agent `−1,000,000` tinybar · service `+1,000,000` · facilitator `−282,113` fee                                     |
| Sealed marker collection             | [`0.0.9762937`](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.9762937): finite supply 1; supply key only |
| Marker carries the exact digest      | [Mirror NFT record](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.9762937/nfts/1) matches byte-for-byte  |
| Marker lifecycle burn                | `deleted=true`, `total_supply=0`, `max_supply=1`                                                                   |

More in [`docs/evidence/`](docs/evidence/).

## Run it

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm test                 # 363 tests

pnpm demo -- --offline    # the full narrative, no network
pnpm demo                 # the full narrative, live on Hedera testnet
pnpm gate:agentbook       # does one human's two agents collapse to one id?
```

The demo **refuses to invent a human identity**. Unregistered agents are marked
`[SIMULATED]` on every line they touch, and `--simulate-humans` makes that
explicit for rehearsal. A rehearsal can never be mistaken for a proof.

## What we do not claim

Remit proves the integrity of the **authorisation path**. It does not prove that
a supplier owns a bank account, that an invoice is genuine, that a person is
honest, or that a verification service is truthful.

- The HTS token is an **audit marker**, not payment authority. Its burn does
  **not** prevent replay — replay is refused by the approval layer via
  `REPLAY_DETECTED` and `ACTION_DIGEST_MISMATCH`. See
  [`docs/evidence/README.md`](docs/evidence/README.md).
- The marker is not the legal or fiscal invoice and does not assign a
  receivable. Its metadata contains no invoice fields. See
  [ADR 0010](docs/architecture/decisions/0010-operational-payable-marker.md).
- Act 1's transfer is a direct HBAR payment;
  `packages/hedera-settlement-adapter` is not implemented.
- The demo speaks x402 directly rather than through
  `packages/hedera-x402-adapter`, so it is protocol-real but not adapter-bound.
- 0G was evaluated and **not** integrated: opening a compute ledger requires a 3
  0G minimum enforced by the LedgerManager contract. See
  [`docs/sponsors/ZERO-G-NO-GO.md`](docs/sponsors/ZERO-G-NO-GO.md).

It inherits World's proof-of-personhood rather than creating it: the strength of
the quorum guarantee equals the strength of World's verification level.

Being precise about this is not a weakness in the pitch. It is why the claims we
_do_ make are believable.

## Development

Node.js `24.11.0`, pnpm `11.17.0` via Corepack.

```bash
pnpm check     # format, lint, typecheck, test, build
pnpm migrate   # apply persistence migrations
pnpm dev
```

| Process           | Port |
| ----------------- | ---: |
| Web               | 3000 |
| Control API       | 4100 |
| Extraction worker | 4150 |
| Verifier          | 4200 |
| x402 facilitator  | 4300 |
| Payment agent     | 4400 |
| Settlement worker | 4500 |

## Provenance

Work began in this repository during ETHGlobal Lisbon 2026. See
[HACKATHON_PROVENANCE.md](HACKATHON_PROVENANCE.md).

## License

Apache-2.0.
