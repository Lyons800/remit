# CallGuard

CallGuard is an exact-action authorization gateway for high-risk company
payments.

A convincing call, message, or agent request may propose a supplier
beneficiary change. It cannot authorize that change. CallGuard freezes the
exact action, requires distinct human-backed approval agents with separately
issued company roles, purchases the configured verification service, and
allows the unchanged request to settle once.

## Status

Architecture and repository bootstrap for ETHGlobal Lisbon 2026.

- Track: Classic / From Scratch
- Core partner integrations: World AgentKit and Hedera
- Optional third integration: 0G, only after its private-compute admission
  gate passes
- Network policy: testnets only until an explicit production security review

CallGuard does not detect deepfakes or prove caller identity, employment,
beneficiary ownership, or the truth of external evidence.

## Provenance

Project-specific work began in this repository during ETHGlobal Lisbon 2026.
See [HACKATHON_PROVENANCE.md](HACKATHON_PROVENANCE.md).

## License

Apache-2.0.
