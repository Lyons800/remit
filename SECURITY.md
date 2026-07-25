# Security policy

## Supported versions

InvoiceGuard is pre-release hackathon software. Only the current `main` branch
is supported.

## Reporting a vulnerability

Do not open a public issue for:

- exposed keys, credentials, stable human identifiers, or sensitive evidence;
- a path that can move value without the required controls;
- replay, double-settlement, signature, or canonicalization defects; or
- a working exploit against a deployed environment.

Until a dedicated security address is configured, contact the repository owner
privately through the authenticated GitHub account. Include:

- affected commit and deployment;
- impact and required preconditions;
- minimal reproduction;
- whether a secret or live account is involved; and
- any action already taken.

Do not access unrelated data, move funds, persist access, or publish details
before remediation.

## Secret handling

- Never commit a private key, mnemonic, API key, HMAC key, signed credential,
  unredacted World human identifier, or sensitive source document.
- Use separate Testnet accounts for service payment and settlement.
- Keep balances and allowances at the minimum required for the demo.
- Rotate any credential that appears in logs, screenshots, chat, CI output, or
  repository history.
- `.env.example` contains names and safe descriptions only.
- Public evidence bundles contain transaction references and redacted proofs,
  not secrets or reusable authorizations.

## Scope and disclaimer

The current project demonstrates a bounded Testnet control path. It has not
received an independent security audit and must not hold or move production
funds.
