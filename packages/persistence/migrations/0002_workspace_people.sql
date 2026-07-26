-- The workspace roster.
--
-- Two of the three facts that decide whether an approval counts are
-- administered here, and only one of them is ours to grant:
--
--   agent_address  the wallet an approver acts through. Which human backs it is
--                  read from World AgentBook at decision time and is
--                  deliberately NOT stored — a cached "this agent is that
--                  human" would let anyone who reached this database
--                  manufacture a quorum, which is the attack the product
--                  exists to prevent.
--   role           this organisation's own grant. NULL means the person is in
--                  the workspace but carries no approval authority.
--
-- Scoped by organization_id like every other table, so one deployment can hold
-- several companies without their rosters ever mixing.

CREATE TABLE workspace_people (
  organization_id uuid NOT NULL,
  person_id text NOT NULL,
  display_name text NOT NULL,
  agent_address text NOT NULL,
  role text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT workspace_people_identity
    PRIMARY KEY (organization_id, person_id),

  -- One agent belongs to at most one person per organisation. Two rows sharing
  -- a wallet would be two identities with one key, which is the same class of
  -- confusion the quorum check exists to refuse.
  CONSTRAINT workspace_people_agent_unique
    UNIQUE (organization_id, agent_address),

  CONSTRAINT workspace_people_agent_address_format
    CHECK ((agent_address ~ '^0x[0-9a-f]{40}$') IS TRUE),

  CONSTRAINT workspace_people_display_name_present
    CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),

  CONSTRAINT workspace_people_role_valid
    CHECK (role IS NULL OR role IN ('FINANCE_APPROVER', 'TREASURY_APPROVER'))
);

CREATE INDEX workspace_people_by_role
  ON workspace_people (organization_id, role)
  WHERE role IS NOT NULL;
