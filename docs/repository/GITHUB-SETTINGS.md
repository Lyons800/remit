# GitHub repository settings

Apply these settings immediately after the public remote is created.

## General

- Visibility: public.
- Default branch: `main`.
- Merge method: rebase merge only.
- Automatically delete head branches: enabled.
- Issues: enabled for bounded work and sponsor questions.
- Discussions, wiki, and projects: disabled until needed.

## Main branch ruleset

Target `main` and enable:

- require a pull request before merging;
- require one approval and Code Owner review once a second active maintainer is
  added;
- dismiss stale approvals after new commits;
- require approval of the most recent push by someone other than its author when
  the team has at least two active maintainers;
- require all conversations to be resolved;
- require linear history;
- require signed commits when every contributor has signing configured;
- block force pushes and deletion;
- require the branch to be up to date; and
- require these status checks:
  - `Quality`;
  - `Secrets`;
  - `Dependency review`.

The provenance root commit is the only direct commit permitted on `main`. With
one maintainer, every change still uses a pull request and required checks, but
GitHub cannot require the author to approve their own work. Administrators
should not bypass the ruleset for ordinary delivery.

## Environments

Create:

- `preview-fake`: no sponsor or financial secrets; displays the `FAKE ADAPTERS`
  banner.
- `integration-testnet`: protected sponsor credentials and dedicated low-balance
  Testnet accounts.
- `demo-live`: protected known-green SHA only; two-person approval for
  settlement, network, or key changes.

Never copy production credentials into a hackathon environment. Environment
secrets are scoped to the single process that owns them.

## Repository security

Enable:

- secret scanning and push protection;
- Dependabot alerts;
- dependency graph;
- private vulnerability reporting; and
- immutable releases.

Code scanning is added when executable sponsor paths exist. It is not used as a
substitute for the explicit threat-model tests.

## Pull-request administration

- Add labels for `world`, `hedera`, `security`, `protocol`, `live-evidence`, and
  `blocked`.
- Require the standard PR template.
- Link every delivery PR to the numbered sequence in
  `docs/plans/DELIVERY-PLAN.md`.
- Keep a known-green demo tag and deployment while later branches continue.

## Current state

- `https://github.com/Lyons800/invoiceguard` is the canonical remote. The
  repository retains its legacy slug while the product is branded Remit.
- `main` contains only the provenance root; delivery proceeds through pull
  requests.
- Pull request 1 carries the bounded repository foundation.
- Rebase merge, automatic head-branch deletion, issue tracking, topics, and the
  planned delivery labels are configured.
- The repository remains private until the owner explicitly approves public
  source disclosure.
- GitHub does not expose rulesets for this private personal repository without a
  paid plan. Apply the documented `main` ruleset immediately after public
  visibility is approved.
