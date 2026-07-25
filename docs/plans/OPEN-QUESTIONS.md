# Open questions

Only questions that can change implementation, claims, or eligibility remain
here.

| ID  | Question                                                                                                                                         | Owner                    | Resolve by              | Decision impact                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ----------------------- | -------------------------------------- |
| Q02 | Is the team dashboard definitely Classic rather than Continuity?                                                                                 | Team lead                | Before submission       | Whole repository eligibility           |
| Q03 | Did ETHGlobal separately announce a maximum of two awards? The supplied deck permits three selected partners but does not state a win cap.       | Team lead / ETHGlobal    | Before prize selection  | Portfolio ceiling, not architecture    |
| Q04 | Can enough World-verified humans complete the AgentBook and exception-approval fixtures during the event?                                        | World integration owner  | G3                      | Distinct-human property and live demo  |
| Q05 | Which World evidence may be shown publicly without exposing a stable human identifier?                                                           | World sponsor engineer   | G3                      | UI and evidence redaction              |
| Q06 | Which Hedera receipt and memo fields should judges inspect for the paid-service and final-action bindings?                                       | Hedera sponsor engineer  | G4                      | Receipt schema and demo                |
| Q09 | Is there a supported privacy-preserving join between an AgentBook human and an action-scoped IDKit nullifier?                                    | World sponsor engineer   | G3                      | Claims and delegate enrollment         |
| Q10 | What exact two-decimal, no-value synthetic-EUR HTS Testnet token ID and metadata will pass the live planning, transfer, and signing-guard spike? | Hedera integration owner | Before G1 action freeze | Asset schema, fixtures, pitch accuracy |
| Q11 | Which ingestion surface is the live demo entry point: API, authenticated upload, or one controlled connector?                                    | Product lead             | Before G3               | Intake contract and demo reliability   |
| Q12 | Which roles create, approve, revoke, and cap standing mandates in the live company fixture?                                                      | Product / security lead  | Before G2               | Straight-through authority and UI      |

Close each row by linking the answer, source, architecture or claim change, and
implementing commit. Informal sponsor guidance is not a guarantee of judging
eligibility.

## Resolved

- Q01: `Lyons800/invoiceguard` is the canonical remote. It was created as a
  private repository on 2026-07-25 so source was not disclosed without explicit
  approval. Public visibility and the public-repository ruleset remain G0
  delivery steps.
- Q07: ADR 0006 requires a successful HCS `authorization.v1` receipt before the
  final transfer. `execution.v1` is an at-least-once postcommit with a stable
  event ID and an explicit `audit-degraded` recovery state.
- Q08: no. The 2026-07-25 admission audit found no suitable private testnet
  chatbot and no released E2EE path with attestation-bound encryption keys and
  authenticated responses. See `docs/sponsors/ZERO-G-NO-GO.md`.
