-- World approval sessions, durable.
--
-- The web app runs on serverless instances, so the request that minted an
-- approval, the request that verifies the phone's proof, and the request that
-- executes the settlement may all land on different processes. The session —
-- and the one-consumption guarantee — must therefore live in the database,
-- not in process memory.
--
-- The status column is the authority for what a session may still do. Every
-- transition is an atomic conditional UPDATE; a lost race is a refusal, never
-- a double execution.
--
--   pending   → verifying            a proof arrived and is being checked
--   verifying → verified | failed    World's verdict (or a local mismatch)
--   verifying → pending              World was unavailable; retry is safe
--   verified  → executed             the settlement consumed the approval
--
-- world_used_action_humans stores only an HMAC-derived principal — never a
-- nullifier or any agent-to-human mapping — and exists so one human cannot
-- approve the same exact action twice.

CREATE TABLE world_approval_sessions (
  approval_session_id text PRIMARY KEY,
  organization_id uuid NOT NULL,
  action_digest text NOT NULL
    CHECK ((action_digest ~ '^[0-9a-f]{64}$') IS TRUE),
  request jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verifying', 'verified', 'executed', 'failed')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE INDEX world_approval_sessions_by_expiry
  ON world_approval_sessions (expires_at);

CREATE INDEX world_approval_sessions_open_by_organization
  ON world_approval_sessions (organization_id)
  WHERE status = 'pending';

CREATE TABLE world_used_action_humans (
  action_human_principal text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

CREATE INDEX world_used_action_humans_by_expiry
  ON world_used_action_humans (expires_at);
