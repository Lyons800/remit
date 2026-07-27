# Remit: real invoice pipeline

Date: 2026-07-27. Approved direction: remove all demo theater. Remit becomes a
working tool: upload a real invoice, real checks run, problems surface because
they exist. World approval and Hedera testnet settlement remain as the real
enforcement and terminal step; euros do not move.

## Flow

1. **Upload** — PDF or image dropped on the Invoices page. Original bytes
   stored (Neon bytea; portfolio scale). `POST /api/invoices/upload`.
2. **Extract** — Claude vision with structured output: supplier name, tax id,
   invoice number, issue/due dates, currency, line items, subtotal, VAT rate
   and amount, total, IBAN/payee. Per-field confidence; low confidence is
   surfaced as "couldn't read reliably", never silently guessed.
3. **Check** — deterministic engine, pure functions, unit-tested:
   - arithmetic: line items → subtotal, VAT math, total consistency
   - IBAN: ISO 13616 mod-97 checksum
   - supplier baseline: first invoice establishes IBAN/details; any later
     divergence is flagged (the fraud vector the product exists for)
   - duplicates: same supplier + invoice number, or same content digest
   - sanity: missing required fields, past due date, currency mismatch,
     amount anomalous vs supplier history
4. **Route** — clean AND ≤ threshold AND known supplier → `STRAIGHT_THROUGH`
   (auto-settle). Anything flagged or large → `HUMAN_APPROVAL`: blocked, the
   specific findings listed, and proceeding requires a World proof-of-human
   approval bound to this exact payment's digest.
5. **Settle** — existing Hedera testnet transfer, memo-bound to the action
   digest derived from the extracted fields via `@remit/protocol`
   (`digestCanonicalValue`). Receipt (tx id, HashScan URL, consensus status)
   persisted on the invoice.

## Architecture changes

- **Durable approval sessions**: the in-memory World approval store moves to
  Neon (`world_approval_sessions`, `world_used_action_humans`). Required for
  Vercel (multi-instance) and survives restarts. Same one-consumption
  guarantee, enforced with an atomic status transition.
- **New tables**: `invoices` (org-scoped; bytes, extraction json, digest,
  status: received → checked → blocked/approved → settled), `invoice_findings`
  (code, severity, detail json), `suppliers` (baseline IBAN/details + stats).
- **Real digests everywhere**: fixture scenarios and generated demo invoices
  are deleted. `/approvals/[id]` becomes invoice-driven.
- **UI truth rule**: every screen reads persisted or on-chain data. Pages that
  cannot be made real are cut, not faked.

## Cut / explicitly out

Demo buttons and simulated tamper/replay controls; dual-token flow in the web
app; real-money rails (SEPA); quorum/B1; multi-tenant onboarding work beyond
what exists; settlement-adapter refactor.

## Order

1. Commit current WIP coherently; green baseline.
2. Durable approval sessions.
3. Schema + repositories for invoices/findings/suppliers.
4. Upload + extraction endpoint.
5. Checks engine (TDD).
6. Routing + digest derivation + approval/settlement wiring.
7. UI: invoices list + detail with findings; remove fixtures/demo copy.
8. Deploy to remithq.xyz; prod env vars; verify live.
