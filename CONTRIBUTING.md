# Contributing

Remit is a security-sensitive financial authorization project. Small, reviewable
changes and explicit evidence are part of the product.

## Before coding

1. Read `AGENTS.md`, the product brief, system architecture, authority model,
   threat model, and applicable ADRs.
2. Confirm the issue or workstream has one outcome and one owner.
3. Create a branch from current `main`.
4. Use a dedicated Git worktree when another person or coding agent is working
   concurrently.
5. Record a new ADR before changing a security invariant, sponsor boundary,
   signing format, network, or deployable boundary.

## Branches

Use:

```text
feat/<short-capability>
fix/<short-defect>
test/<short-proof>
docs/<short-topic>
chore/<short-maintenance>
spike/<sponsor-or-risk>
```

One branch owns one bounded change. Do not mix unrelated refactors, dependency
upgrades, formatting, and product behavior.

## Worktrees and parallel sessions

Each concurrent person or agent gets one branch and one worktree. Never let two
sessions edit the same working directory.

```bash
git fetch origin
git worktree add ../remit-<topic> -b <branch> origin/main
cd ../remit-<topic>
pnpm install --frozen-lockfile
```

All worktrees in this project share the same trusted developer boundary. Do not
share a writable pnpm store with untrusted code or users.

At session end, complete `docs/plans/SESSION-HANDOFF.template.md` in the task
notes or PR, leave the worktree clean, and report the branch, SHA, checks,
evidence, blocker, and next exact action.

## Commits

Use Conventional Commits:

```text
feat(domain): add canonical payment action
fix(hedera): reconcile uncertain settlement receipt
test(world): prove same-human quorum collapse
docs(architecture): record split-key decision
chore(deps): pin AgentKit 0.2.0
```

Rules:

- one logical change per commit;
- imperative subject, at most 72 characters;
- explain why and risk in the body when non-obvious;
- each commit should build and test where practical;
- never commit secrets, live private evidence, generated credentials, or
  unredacted stable identifiers;
- do not hide functional changes in formatting or dependency commits;
- do not commit `fixup!` or `WIP` commits to the final PR history; and
- retain meaningful incremental history required by sponsor rules.

## Pull requests

The repository-provenance commit is the only direct commit to `main`. Every
subsequent change uses a pull request.

A PR must:

- have a Conventional Commit-style title;
- solve one reviewable problem;
- normally stay below 500 non-generated changed lines;
- link the issue, plan item, ADR, or sponsor requirement;
- identify changed trust boundaries and failure modes;
- include positive, negative, and recovery tests as applicable;
- update documentation and evidence schemas with behavior;
- name every fake, fixture, or mocked boundary;
- state whether live sponsor evidence was run and where it is recorded; and
- pass all required checks.

Large generated files, lockfiles, and official vendored templates are excluded
from the line target but must be clearly identified.

## Review order

Review in this order:

1. claims and product behavior;
2. authorization and security invariants;
3. state transitions and failure recovery;
4. sponsor-documentation correctness;
5. data privacy and key boundaries;
6. tests and live evidence;
7. API and domain design;
8. maintainability and style.

Do not approve a change because the happy path looks correct if its failure
behavior is unproved.

## Merge strategy

- Keep `main` green and deployable.
- Rebase the branch on current `main` before final approval.
- Use rebase merge to retain intentionally structured commits and linear
  history.
- Delete the remote branch and remove its worktree after merge.
- Tag only reproducible builds whose evidence manifest names the exact SHA.

## Dependency changes

Dependency PRs are isolated. They include:

- exact old and new versions;
- first-party changelog/release source;
- license check;
- lockfile diff;
- sponsor contract tests for sponsor/crypto packages; and
- rollback note.

Do not weaken pnpm supply-chain policy globally to install one package.

## Live integration policy

Unit and PR-preview tests may use explicit fakes. Live integration and demo
environments may not.

`DEMO_MODE=live` must fail startup when:

- an admitted sponsor adapter is fake;
- a required key or endpoint is absent;
- the network is not allowlisted Testnet;
- the build SHA cannot be included in evidence.

## Definition of done

A change is done when code, tests, docs, migration/rollback, observability,
security impact, and evidence are reviewed together. "Works on my machine" is
not completion.
