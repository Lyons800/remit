-- Real invoices, their findings, and supplier baselines.
--
-- An invoice row carries the original uploaded bytes, the AI extraction with
-- per-field confidence, and the deterministic check results via
-- invoice_findings. The supplier baseline is the anti-fraud anchor: the first
-- invoice from a supplier establishes the account details, and later
-- divergence is a finding, never a silent update.
--
-- content_sha256 is unique per organisation so the exact same document cannot
-- be ingested twice; near-duplicates (same supplier + invoice number) are a
-- check, not a constraint, because they need human judgement.

CREATE TABLE suppliers (
  organization_id uuid NOT NULL,
  supplier_key text NOT NULL,
  display_name text NOT NULL,
  tax_id text,
  iban text,
  invoice_count integer NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT suppliers_identity PRIMARY KEY (organization_id, supplier_key),
  CONSTRAINT suppliers_display_name_present
    CHECK (length(btrim(display_name)) BETWEEN 1 AND 200)
);

CREATE TABLE invoices (
  invoice_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  original_filename text NOT NULL,
  content_type text NOT NULL,
  content bytea NOT NULL,
  content_sha256 text NOT NULL
    CHECK ((content_sha256 ~ '^[0-9a-f]{64}$') IS TRUE),
  extraction jsonb,
  supplier_key text,
  supplier_name text,
  invoice_number text,
  currency text,
  total_cents bigint,
  iban text,
  due_date date,
  action_digest text
    CHECK (action_digest IS NULL OR (action_digest ~ '^[0-9a-f]{64}$') IS TRUE),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN
      ('received', 'checked', 'blocked', 'approved', 'settled', 'failed')),
  route text
    CHECK (route IS NULL OR route IN ('STRAIGHT_THROUGH', 'HUMAN_APPROVAL')),
  settlement jsonb,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT invoices_content_unique UNIQUE (organization_id, content_sha256)
);

CREATE INDEX invoices_by_organization
  ON invoices (organization_id, created_at DESC);

CREATE INDEX invoices_by_supplier
  ON invoices (organization_id, supplier_key)
  WHERE supplier_key IS NOT NULL;

CREATE TABLE invoice_findings (
  invoice_id uuid NOT NULL REFERENCES invoices (invoice_id) ON DELETE CASCADE,
  finding_index integer NOT NULL,
  code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  detail jsonb NOT NULL,

  CONSTRAINT invoice_findings_identity PRIMARY KEY (invoice_id, finding_index)
);
