## Outcome

<!-- One sentence describing the user-visible or engineering result. -->

## Why

<!-- Link the issue, plan item, ADR, sponsor requirement, or defect. -->

## Changes

-

## Trust and claim impact

- Changed trust boundary:
- Changed authorization/security invariant:
- Changed public claim or limitation:
- New/changed key, credential, network, or sensitive data:

## Evidence

- Unit/property tests:
- Integration/contract tests:
- End-to-end tests:
- Live sponsor test and evidence path:
- Negative/recovery tests:

## Sponsor documentation

- Sponsor/package/version:
- First-party documentation URL:
- Documented fact versus InvoiceGuard design choice:

## Operations

- Migration:
- Rollback:
- Observability:
- Deployment/configuration:

## Checklist

- [ ] The PR has one bounded outcome and no unrelated refactor.
- [ ] Every amount is an integer and every network/account is explicit.
- [ ] The canonical action and authorization bindings remain intact.
- [ ] `MISMATCH`, `UNKNOWN`, mutation, expiry, revocation, and replay fail
      closed where relevant.
- [ ] No secret, live private evidence, or raw World human identifier is
      committed or logged.
- [ ] Fakes/fixtures are explicit; live mode has no silent fallback.
- [ ] Tests, docs, claims, and evidence schemas changed with behavior.
- [ ] The branch is rebased on current `main` and all required checks pass.
