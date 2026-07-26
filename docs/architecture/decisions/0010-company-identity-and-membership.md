# ADR 0010: Company identity and membership

- Status: accepted
- Date: 2026-07-26

## Context

InvoiceGuard needs normal company onboarding before a finance operator can use
the control room. World establishes human-backed-agent accountability and fresh
action-time human participation; it is not a company login, employment
directory, or source of organizational authority.

The first deployed product also needs to keep its public synthetic demo
available to judges while giving signed-in users a durable, revocable session
and an organization-scoped workspace.

## Decision

Use Better Auth with PostgreSQL for application identity, sessions, and
organization membership. Google OAuth is the first identity provider.

The server-side Better Auth handler runs at `/api/auth/*` on the web origin.
Only server code may read the OAuth client secret, Better Auth secret, or
database credential. Browser code receives the resulting secure session cookie,
never those credentials.

Use the Better Auth organization plugin for:

- creating an organization after first sign-in;
- selecting the active organization;
- member invitations and removal; and
- application-access roles such as owner, admin, and member.

These roles control access to InvoiceGuard product surfaces only. They are not
the finance roles in a company-role credential and cannot authorize a payment.
The control API remains responsible for translating an authenticated application
subject and organization into separately governed, revocable financial
authority.

The initial flow is:

1. sign in with Google;
2. create a new organization or accept an invitation;
3. select an active organization;
4. enter the organization-scoped control room; and
5. obtain any financial role through a separate governed enrollment workflow.

Google profile data establishes the application subject and verified email
address reported by Google. InvoiceGuard does not infer employment, company
ownership, finance authority, or a World identity from that profile. It does not
auto-join organizations from an email domain.

The public landing page and synthetic judge demo remain accessible without a
session. Organization data and every state-changing control route require a
current database-backed session and server-resolved organization membership.

## Security configuration

- Pin the production base URL so OAuth callbacks cannot fall back to localhost.
- Allow only the local and production InvoiceGuard origins.
- Store sessions in PostgreSQL so they can be revoked.
- Use secure, HTTP-only, same-site cookies in production.
- Keep OAuth access to the minimum identity scopes: `openid`, `email`, and
  `profile`.
- Store auth tables in a dedicated PostgreSQL schema or equivalently isolated
  migration namespace.
- Resolve the active organization from the validated session; never trust an
  arbitrary browser-supplied organization ID.
- Require a fresh control-API check of company financial authority before every
  approval or effect.
- Rotate any credential exposed outside the deployment secret store before a
  production launch.

## Consequences

- Company onboarding uses a conventional workflow that finance teams understand.
- Better Auth organization roles and InvoiceGuard financial roles remain
  intentionally separate.
- A production database and migrations are required before organization
  onboarding can be enabled.
- The web deployment gains a server-only identity boundary and two non-financial
  credentials: the OAuth client secret and Better Auth secret.
- The control API must verify the authenticated subject and current membership;
  a session assertion alone never creates a payment authorization fact.
- Stateless Better Auth mode is rejected because it cannot provide durable
  organization membership or immediate session revocation.

## Rejected alternatives

- World login as company SSO: does not establish an organization, employment, or
  finance role.
- Wallet-only login: creates unnecessary friction and still does not establish
  company authority.
- Stateless production sessions: no durable organization membership and weak
  revocation semantics.
- Email-domain auto-join: domain possession is not an invitation or role grant.
- Better Auth organization role as payment authority: collapses application
  access and financial governance.

## First-party sources

- [Better Auth Google provider](https://better-auth.com/docs/authentication/google)
- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Better Auth organization plugin](https://better-auth.com/docs/plugins/organization)
- [Better Auth session management](https://better-auth.com/docs/concepts/session-management)
- [Google OAuth verification guidance](https://support.google.com/cloud/answer/13463073?hl=en)
