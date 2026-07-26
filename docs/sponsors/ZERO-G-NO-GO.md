# 0G admission record

> **Superseding reason (2026-07-26).** The original no-go argued no suitable
> private testnet text model existed. That was wrong — a live catalog probe
> found `qwen/qwen2.5-omni-7b`, TeeML, healthy at 100% uptime on testnet, and
> mainnet carries several stronger models. The actual blocker is funding:
> `LedgerProcessor.MIN_LEDGER_BALANCE_OG = 3`, matching `MIN_ACCOUNT_BALANCE` in
> the LedgerManager contract, so opening a compute ledger costs 3 0G before a
> single inference. `acknowledgeProviderSigner` then moves 1 0G and the first
> `getRequestHeaders` needs roughly 2 more. Testnet faucets dispense a fraction
> of that. The adapter is written and its provider selection works live; it
> stops at the ledger.
>
> A second finding worth recording: `processResponse` verifies an **ECDSA
> signature**, not a TEE attestation — it recovers the signer and compares it to
> the provider's registered TEE signer address. Genuine attestation lives in
> `verifyService()`. Any future integration must not describe a signed response
> as attested compute.

Decision: **NO-GO** for the current Remit submission.

Last refreshed: 2026-07-25 22:42 WEST.

Remit selects World and Hedera only. No 0G SDK, credential, funded wallet, or
runtime is installed.

## Why admission failed

# 0G: no-go — the compute ledger minimum is 3 0G

The live testnet Router catalog exposes:

- `qwen-image-edit` as `TeeML`, but it is an image-editing model; and
- `qwen2.5-omni` as a chatbot, but the healthy provider is classified `TeeTLS`,
  not private model-in-TEE inference.

The refresh queried both the Testnet model catalog and the chatbot-provider
catalog. The latter reported the sole chatbot provider as healthy and
TEE-attested but still classified it as `TeeTLS`. The contradictory prototype
probe was not reproducible; TEE-attested transport is not the `TeeML` execution
class required by this admission record.

Mainnet currently exposes healthy private text models, including
`0gm-1.0-35b-a3b`, but using them would add an unreviewed funded 0G mainnet
operation, credential boundary, and incident-response obligation.

### E2EE does not yet provide response authenticity

The first-party `0g-pc-e2ee` repository has no tagged release. At commit
`97345423ebe7140091bbc8fae2c41f8d046e2eeb`:

- the README describes early/design-stage software;
- TypeScript/WASM and sidecar quickstart work remain planned;
- source and issue 7 state that provider attestation and response-signature
  verification are not implemented;
- issue 18 records that a malicious Router can substitute the endpoint and
  broker key; and
- the broker design states that `enc_pub` is not bound into attestation
  `report_data`.

This can provide transport confidentiality under assumptions, but it cannot
support Remit's required authenticated, verifiable provider result.

### Released SDK does not prove exact content binding

`@0gfoundation/0g-compute-ts-sdk@0.9.0` retrieves a signed text response and
verifies its signer, but its released response helper does not recompute and
compare exact request and response commitments. The Router's
`tee_verified: true` is a Router assertion rather than raw proof returned to
Remit.

Remit therefore cannot truthfully bind:

```text
action digest
+ evidence root
+ exact private input
+ exact model/provider
+ exact output
+ expiry
+ independently verified TEE evidence
```

## Security consequence

Adding 0G now would force one of three unacceptable choices:

1. use non-private testnet inference while calling it private;
2. use mainnet without an approved exception; or
3. trust unauthenticated E2EE/provider assertions for a financial gate.

The correct behavior is to leave the extension unimplemented and preserve the
signed verifier contract for a future implementation.

## Hard reconsideration gate

Every condition must pass:

- an approved-network private `TeeML` chatbot is healthy;
- a tagged E2EE client release verifies the TEE quote and expected measurement;
- the provider encryption key and signer are attestation-bound;
- the signer is matched against the onchain service record;
- exact request and response commitments are independently verified;
- provider/model fallback is disabled and pinned;
- deterministic request/output schemas bind Remit's existing action and evidence
  digests;
- mutation, replay, prompt-injection, outage, and no-downgrade tests pass;
- any failure becomes `UNKNOWN` and moves no value;
- ten live runs fit the demo latency budget; and
- judges can reproduce the redacted proof bundle.

Only then may ADR 0005 be reopened. A mainnet exception additionally requires an
explicit network, funding, custody, and incident-response review.

## First-party evidence

- [Live testnet model catalog](https://router-api-testnet.integratenetwork.work/v1/models)
- [Live testnet chatbot providers](https://router-api-testnet.integratenetwork.work/v1/providers?service_type=chatbot)
- [Live mainnet model catalog](https://router-api.0g.ai/v1/models)
- [Mainnet candidate provider](https://router-api.0g.ai/v1/providers?model=0gm-1.0-35b-a3b)
- [`0g-pc-e2ee` repository](https://github.com/0gfoundation/0g-pc-e2ee)
- [Current reviewed E2EE commit](https://github.com/0gfoundation/0g-pc-e2ee/commit/97345423ebe7140091bbc8fae2c41f8d046e2eeb)
- [Missing attestation/signature verification](https://github.com/0gfoundation/0g-pc-e2ee/issues/7)
- [Router key-substitution threat](https://github.com/0gfoundation/0g-pc-e2ee/issues/18)
- [Broker E2EE design](https://github.com/0gfoundation/0g-serving-broker/blob/e5b2b60e2ba0751f6538e9f9e924f743072397ff/docs/design/e2ee.md)
- [`@0gfoundation/0g-compute-ts-sdk@0.9.0`](https://github.com/0gfoundation/0g-compute-ts-sdk/releases/tag/v0.9.0)
- [Released response verification helper](https://github.com/0gfoundation/0g-compute-ts-sdk/blob/v0.9.0/src.ts/sdk/inference/broker/response.ts#L25-L102)
- [0G verifiable-execution documentation](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/verifiable-execution)
