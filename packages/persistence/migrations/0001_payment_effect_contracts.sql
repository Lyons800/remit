CREATE TABLE payment_actions (
  organization_id uuid NOT NULL,
  action_id uuid NOT NULL,
  action_digest text NOT NULL,
  obligation_id uuid NOT NULL,
  invoice_revision_id uuid NOT NULL,
  nonce text NOT NULL,
  payment_state text NOT NULL,
  aggregate_version integer NOT NULL,
  atomic_group_key text NOT NULL,
  aggregate jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT payment_action_identity
    PRIMARY KEY (organization_id, action_id),
  CONSTRAINT payment_action_digest
    UNIQUE (organization_id, action_digest),
  CONSTRAINT one_action_per_invoice_revision
    UNIQUE (organization_id, invoice_revision_id),
  CONSTRAINT payment_action_nonce
    UNIQUE (organization_id, nonce),
  CONSTRAINT payment_action_digest_format
    CHECK (action_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT payment_action_nonce_format
    CHECK (nonce ~ '^[0-9a-f]{32}$'),
  CONSTRAINT payment_action_state_valid
    CHECK (
      payment_state IN (
        'CAPTURED',
        'CLASSIFIED',
        'VERIFICATION_QUOTED',
        'VERIFICATION_PAID',
        'EVIDENCE_SATISFIED',
        'AWAITING_APPROVALS',
        'AUTHORIZED',
        'AUTHORIZATION_RECOVERY',
        'AUDIT_COMMITTED',
        'SETTLEMENT_PENDING',
        'SETTLEMENT_RECOVERY',
        'SETTLED_AUDIT_PENDING',
        'SETTLED_AUDIT_DEGRADED',
        'SETTLED',
        'RECONCILING',
        'RECONCILED',
        'RECONCILIATION_EXCEPTION',
        'REJECTED',
        'EXPIRED',
        'SUPERSEDED',
        'CANCELLED'
      )
    ),
  CONSTRAINT payment_action_version_positive
    CHECK (aggregate_version > 0),
  CONSTRAINT payment_action_aggregate_object
    CHECK (jsonb_typeof(aggregate) = 'object'),
  CONSTRAINT payment_action_aggregate_binding
    CHECK (
      organization_id::text =
        aggregate #>> '{authorization,actionCore,organizationId}'
      AND action_id::text =
        aggregate #>> '{authorization,actionCore,actionId}'
      AND action_digest =
        aggregate #>> '{authorization,envelope,actionDigest}'
      AND obligation_id::text =
        aggregate #>> '{authorization,actionCore,sourceInvoice,obligationId}'
      AND invoice_revision_id::text =
        aggregate #>> '{authorization,actionCore,sourceInvoice,invoiceRevisionId}'
      AND nonce =
        aggregate #>> '{authorization,actionCore,nonce}'
      AND payment_state = aggregate #>> '{state}'
      AND aggregate_version =
        (aggregate #>> '{metadata,version}')::integer
    ),
  CONSTRAINT payment_action_atomic_group_binding
    CHECK (
      atomic_group_key =
        'payment:' || action_digest || ':v' || aggregate_version::text
    )
);

CREATE UNIQUE INDEX one_nonterminal_action_per_obligation
  ON payment_actions (organization_id, obligation_id)
  WHERE payment_state NOT IN (
    'RECONCILED',
    'RECONCILIATION_EXCEPTION',
    'REJECTED',
    'EXPIRED',
    'SUPERSEDED',
    'CANCELLED'
  );

CREATE TABLE approval_facts (
  organization_id uuid NOT NULL,
  action_digest text NOT NULL,
  approval_id text NOT NULL,
  decision_id text NOT NULL,
  approval_session_id text NOT NULL,
  world_proof_id text NOT NULL,
  consumption_claim_id text NOT NULL,
  subject_id text NOT NULL,
  agent_tenant_principal text NOT NULL,
  action_human_principal text NOT NULL,
  record_digest text NOT NULL,
  atomic_group_key text NOT NULL,
  fact jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT approval_identity
    PRIMARY KEY (organization_id, approval_id),
  CONSTRAINT approval_decision_identity
    UNIQUE (organization_id, decision_id),
  CONSTRAINT approval_session_identity
    UNIQUE (organization_id, approval_session_id),
  CONSTRAINT world_proof_identity
    UNIQUE (organization_id, world_proof_id),
  CONSTRAINT approval_consumption_identity
    UNIQUE (organization_id, consumption_claim_id),
  CONSTRAINT approval_subject_per_action
    UNIQUE (organization_id, action_digest, subject_id),
  CONSTRAINT approval_agentbook_principal_per_action
    UNIQUE (organization_id, action_digest, agent_tenant_principal),
  CONSTRAINT approval_action_human_principal_per_action
    UNIQUE (organization_id, action_digest, action_human_principal),
  CONSTRAINT approval_fact_record_digest_format
    CHECK (record_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT approval_fact_object
    CHECK (jsonb_typeof(fact) = 'object'),
  CONSTRAINT approval_fact_action
    FOREIGN KEY (organization_id, action_digest)
    REFERENCES payment_actions (organization_id, action_digest)
    ON DELETE RESTRICT
);

CREATE TABLE agentkit_challenge_consumptions (
  organization_id uuid NOT NULL,
  agentkit_challenge_id text NOT NULL,
  action_digest text NOT NULL,
  fact_kind text NOT NULL,
  fact_record_digest text NOT NULL,
  atomic_group_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT agentkit_challenge_identity
    PRIMARY KEY (organization_id, agentkit_challenge_id),
  CONSTRAINT agentkit_challenge_kind_valid
    CHECK (fact_kind IN ('APPROVAL', 'REQUESTING_AGENT')),
  CONSTRAINT agentkit_challenge_record_digest_format
    CHECK (fact_record_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agentkit_challenge_action
    FOREIGN KEY (organization_id, action_digest)
    REFERENCES payment_actions (organization_id, action_digest)
    ON DELETE RESTRICT
);

CREATE TABLE standing_mandate_versions (
  organization_id uuid NOT NULL,
  mandate_id uuid NOT NULL,
  mandate_version integer NOT NULL,
  mandate_digest text NOT NULL,
  mandate jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT standing_mandate_version_identity
    PRIMARY KEY (organization_id, mandate_id, mandate_version),
  CONSTRAINT standing_mandate_version_positive
    CHECK (mandate_version > 0),
  CONSTRAINT standing_mandate_digest_format
    CHECK (mandate_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT standing_mandate_object
    CHECK (jsonb_typeof(mandate) = 'object')
);

CREATE TABLE mandate_period_ledgers (
  organization_id uuid NOT NULL,
  mandate_id uuid NOT NULL,
  mandate_version integer NOT NULL,
  period_key text NOT NULL,
  mandate_digest text NOT NULL,
  period_cap_atoms numeric(78, 0) NOT NULL,
  reserved_atoms numeric(78, 0) NOT NULL DEFAULT 0,
  settled_atoms numeric(78, 0) NOT NULL DEFAULT 0,
  released_atoms numeric(78, 0) NOT NULL DEFAULT 0,
  ledger_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT mandate_period_ledger_identity
    PRIMARY KEY (organization_id, mandate_id, mandate_version, period_key),
  CONSTRAINT mandate_period_ledger_mandate
    FOREIGN KEY (organization_id, mandate_id, mandate_version)
    REFERENCES standing_mandate_versions (
      organization_id,
      mandate_id,
      mandate_version
    )
    ON DELETE RESTRICT,
  CONSTRAINT mandate_period_amounts_valid
    CHECK (
      period_cap_atoms > 0
      AND reserved_atoms >= 0
      AND settled_atoms >= 0
      AND released_atoms >= 0
      AND reserved_atoms + settled_atoms <= period_cap_atoms
    ),
  CONSTRAINT mandate_period_ledger_version_positive
    CHECK (ledger_version > 0),
  CONSTRAINT mandate_period_digest_format
    CHECK (mandate_digest ~ '^[0-9a-f]{64}$')
);

CREATE TABLE mandate_reservations (
  organization_id uuid NOT NULL,
  mandate_id uuid NOT NULL,
  mandate_version integer NOT NULL,
  period_key text NOT NULL,
  action_digest text NOT NULL,
  amount_atoms numeric(78, 0) NOT NULL,
  reservation_status text NOT NULL,
  atomic_group_key text NOT NULL,
  receipt_id text,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT mandate_reservation_action
    PRIMARY KEY (
      organization_id,
      mandate_id,
      mandate_version,
      period_key,
      action_digest
    ),
  CONSTRAINT mandate_reservation_amount_positive
    CHECK (amount_atoms > 0),
  CONSTRAINT mandate_reservation_status_valid
    CHECK (reservation_status IN ('RESERVED', 'RELEASED', 'SETTLED')),
  CONSTRAINT mandate_reservation_receipt_binding
    CHECK (
      (reservation_status = 'SETTLED' AND receipt_id IS NOT NULL)
      OR (reservation_status <> 'SETTLED' AND receipt_id IS NULL)
    ),
  CONSTRAINT mandate_reservation_ledger
    FOREIGN KEY (organization_id, mandate_id, mandate_version, period_key)
    REFERENCES mandate_period_ledgers (
      organization_id,
      mandate_id,
      mandate_version,
      period_key
    )
    ON DELETE RESTRICT,
  CONSTRAINT mandate_reservation_payment
    FOREIGN KEY (organization_id, action_digest)
    REFERENCES payment_actions (organization_id, action_digest)
    ON DELETE RESTRICT
);

CREATE TABLE settlement_attempts (
  organization_id uuid NOT NULL,
  attempt_id text NOT NULL,
  action_digest text NOT NULL,
  idempotency_key text NOT NULL,
  transaction_id text NOT NULL,
  signed_bytes_hash text NOT NULL,
  effect_digest text NOT NULL,
  network_id text NOT NULL,
  adapter_id text NOT NULL,
  atomic_group_key text NOT NULL,
  attempt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT settlement_attempt_identity
    PRIMARY KEY (organization_id, attempt_id),
  CONSTRAINT settlement_idempotency_key
    UNIQUE (organization_id, idempotency_key),
  CONSTRAINT settlement_attempt_per_action
    UNIQUE (organization_id, action_digest),
  CONSTRAINT settlement_attempt_hashes_valid
    CHECK (
      signed_bytes_hash ~ '^[0-9a-f]{64}$'
      AND effect_digest ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT settlement_attempt_object
    CHECK (jsonb_typeof(attempt) = 'object'),
  CONSTRAINT settlement_attempt_payment
    FOREIGN KEY (organization_id, action_digest)
    REFERENCES payment_actions (organization_id, action_digest)
    ON DELETE RESTRICT
);

CREATE TABLE settlement_receipts (
  organization_id uuid NOT NULL,
  receipt_id text NOT NULL,
  attempt_id text NOT NULL,
  action_digest text NOT NULL,
  transaction_id text NOT NULL,
  signed_bytes_hash text NOT NULL,
  effect_digest text NOT NULL,
  network_id text NOT NULL,
  adapter_id text NOT NULL,
  atomic_group_key text NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT settlement_receipt_identity
    PRIMARY KEY (organization_id, receipt_id),
  CONSTRAINT settlement_receipt_hashes_valid
    CHECK (
      signed_bytes_hash ~ '^[0-9a-f]{64}$'
      AND effect_digest ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT settlement_receipt_object
    CHECK (jsonb_typeof(receipt) = 'object'),
  CONSTRAINT settlement_receipt_attempt
    FOREIGN KEY (organization_id, attempt_id)
    REFERENCES settlement_attempts (organization_id, attempt_id)
    ON DELETE RESTRICT,
  CONSTRAINT settlement_receipt_payment
    FOREIGN KEY (organization_id, action_digest)
    REFERENCES payment_actions (organization_id, action_digest)
    ON DELETE RESTRICT
);

CREATE TABLE settlement_consumptions (
  organization_id uuid NOT NULL,
  claim_id text NOT NULL,
  obligation_id uuid NOT NULL,
  action_digest text NOT NULL,
  attempt_id text NOT NULL,
  receipt_id text NOT NULL,
  consumption_status text NOT NULL,
  expected_aggregate_version integer NOT NULL,
  atomic_group_key text NOT NULL,
  claim jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT settlement_consumption_claim_identity
    PRIMARY KEY (organization_id, claim_id),
  CONSTRAINT settlement_consumption_status_valid
    CHECK (consumption_status = 'CONSUMED'),
  CONSTRAINT settlement_consumption_expected_version_positive
    CHECK (expected_aggregate_version > 0),
  CONSTRAINT settlement_consumption_object
    CHECK (jsonb_typeof(claim) = 'object'),
  CONSTRAINT settlement_consumption_receipt
    FOREIGN KEY (organization_id, receipt_id)
    REFERENCES settlement_receipts (organization_id, receipt_id)
    ON DELETE RESTRICT,
  CONSTRAINT settlement_consumption_attempt
    FOREIGN KEY (organization_id, attempt_id)
    REFERENCES settlement_attempts (organization_id, attempt_id)
    ON DELETE RESTRICT,
  CONSTRAINT settlement_consumption_payment
    FOREIGN KEY (organization_id, action_digest)
    REFERENCES payment_actions (organization_id, action_digest)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX one_settlement_per_obligation
  ON settlement_consumptions (organization_id, obligation_id)
  WHERE consumption_status = 'CONSUMED';

CREATE TABLE outbox_events (
  organization_id uuid NOT NULL,
  event_id text NOT NULL,
  action_digest text NOT NULL,
  effect_type text NOT NULL,
  effect_family text NOT NULL,
  idempotency_key text NOT NULL,
  immutable_binding jsonb NOT NULL,
  payload jsonb NOT NULL,
  first_atomic_group_key text NOT NULL,
  last_atomic_group_key text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'PENDING',
  available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  lease_token text,
  lease_owner text,
  lease_expires_at timestamptz,
  delivery_attempts integer NOT NULL DEFAULT 0,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT outbox_event_identity
    PRIMARY KEY (organization_id, event_id),
  CONSTRAINT outbox_effect_type_valid
    CHECK (
      effect_type IN (
        'VERIFICATION_QUOTE_REQUEST',
        'SETTLEMENT_SUBMISSION_REQUEST',
        'SETTLEMENT_RETRY_REQUEST',
        'EXECUTION_AUDIT_REQUEST'
      )
    ),
  CONSTRAINT outbox_effect_family_valid
    CHECK (
      effect_family IN (
        'VERIFICATION_QUOTE',
        'SETTLEMENT_SUBMISSION',
        'EXECUTION_AUDIT'
      )
    ),
  CONSTRAINT outbox_delivery_status_valid
    CHECK (delivery_status IN ('PENDING', 'LEASED', 'DELIVERED')),
  CONSTRAINT outbox_attempts_nonnegative
    CHECK (delivery_attempts >= 0),
  CONSTRAINT outbox_payloads_are_objects
    CHECK (
      jsonb_typeof(immutable_binding) = 'object'
      AND jsonb_typeof(payload) = 'object'
    ),
  CONSTRAINT outbox_lease_state_valid
    CHECK (
      (
        delivery_status = 'LEASED'
        AND lease_token IS NOT NULL
        AND lease_owner IS NOT NULL
        AND lease_expires_at IS NOT NULL
        AND delivered_at IS NULL
      )
      OR (
        delivery_status = 'PENDING'
        AND lease_token IS NULL
        AND lease_owner IS NULL
        AND lease_expires_at IS NULL
        AND delivered_at IS NULL
      )
      OR (
        delivery_status = 'DELIVERED'
        AND lease_token IS NULL
        AND lease_owner IS NULL
        AND lease_expires_at IS NULL
        AND delivered_at IS NOT NULL
      )
    ),
  CONSTRAINT outbox_event_payment
    FOREIGN KEY (organization_id, action_digest)
    REFERENCES payment_actions (organization_id, action_digest)
    ON DELETE RESTRICT
);

CREATE INDEX outbox_events_claimable
  ON outbox_events (available_at, created_at, organization_id, event_id)
  WHERE delivery_status IN ('PENDING', 'LEASED');
