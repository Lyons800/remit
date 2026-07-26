# Evidence register

Checked: 2026-07-26.

InvoiceGuard separates public network facts from operator notes and from
end-to-end product evidence. A Testnet receipt is real evidence, but it proves
only the transition visible in that receipt.

| Evidence                                               | Publicly verified now                                                                  | Product status                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [x402 payment](x402-live-2026-07-26.md)                | `0.01 HBAR` agent-to-service transfer; separate facilitator paid the network fee       | Live protocol spike; not executed through the committed AP adapter                             |
| [HTS lifecycle marker](hts-payable-live-2026-07-26.md) | collection creation, mint, metadata, burn, key policy, and zero current supply         | Live protocol spike; deliberately excluded from payment authority and replay prevention        |
| Hedera AP adapter tests                                | canonical request, quote, transaction, attestation, result, and recovery substitutions | Offline contract evidence; live AP-bound runner and raw evidence bundle still required         |
| World adapter tests                                    | strict AgentKit, AgentBook, IDKit, company-role, and atomic admission contracts        | Offline contract evidence; registered humans, live proof, and authenticated repository pending |
| PostgreSQL persistence tests                           | durable transition and uniqueness contracts                                            | Local integration evidence; deployed database and process recovery demonstration pending       |

The web application reads the public Mirror endpoints directly and validates the
expected transaction, accounts, amounts, token lifecycle, metadata, and key
configuration. A missing or changed response is shown as unavailable or
mismatched; it never falls back to a synthetic receipt.

Synthetic invoices, supplier records, policies, and approval interactions in the
product demo are labelled scenario data. They explain the intended AP workflow
but are not sponsor or network evidence.
