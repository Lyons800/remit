# Open questions

Only questions that can change implementation or eligibility remain here.

| ID  | Question                                                                                                                                   | Owner                   | Resolve by                | Decision impact                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------- | ------------------------------------ |
| Q01 | Which GitHub owner or organization should host the public repository? The local CLI account `Lyons800` currently has an invalid token.     | Repository owner        | Before remote creation    | Remote URL, CODEOWNERS, branch rules |
| Q02 | Is the team dashboard definitely Classic rather than Continuity?                                                                           | Team lead               | Before partner submission | Whole repository eligibility         |
| Q03 | Did ETHGlobal separately announce a maximum of two awards? The supplied deck permits three selected partners but does not state a win cap. | Team lead / ETHGlobal   | Before prize selection    | Portfolio ceiling, not architecture  |
| Q04 | Can enough World-verified humans complete both the AgentBook and action-time approval fixtures during the event?                           | World integration owner | G2                        | Core CallGuard qualification         |
| Q05 | Which World evidence may be shown publicly without exposing a stable human identifier?                                                     | World sponsor engineer  | G2                        | UI and evidence redaction            |
| Q06 | Which Hedera receipt and memo fields should judges inspect for the paid-service binding?                                                   | Hedera sponsor engineer | G3                        | Receipt schema and demo              |
| Q09 | Is there a supported privacy-preserving join between an AgentBook human and an action-scoped IDKit nullifier?                              | World sponsor engineer  | G2                        | Claims and delegate enrollment       |

Close each row by linking the answer, source, architecture/claim change, and
implementing commit. Informal sponsor guidance is not a guarantee of judging
eligibility.

## Resolved

- Q07: ADR 0006 requires a successful HCS `approval.v1` receipt before the final
  transfer. `execution.v1` is an at-least-once postcommit with a stable event ID
  and an explicit `audit-degraded` recovery state.
- Q08: no. The 2026-07-25 admission audit found no suitable private testnet
  chatbot and no released E2EE path with attestation-bound encryption keys and
  authenticated responses. See `docs/sponsors/ZERO-G-NO-GO.md`.
