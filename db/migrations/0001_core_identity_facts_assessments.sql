-- LayerNet migration 0001: tenancy, identity, transaction facts, risk
-- assessments, and the governance audit trail.
--
-- Implements docs/architecture/DATA_CONTRACT_v1.md (D1 PostgreSQL, D2 multi-
-- workspace, D3 roles, D6 audited deletion). Investigation cases and case
-- events are deliberately left to a later migration, together with their UI.
--
-- Invariants enforced here, in the database, so that one application bug
-- cannot silently rewrite history:
--   * transaction facts, risk assessments and audit events are never UPDATEd;
--   * audit events are never DELETEd or TRUNCATEd;
--   * facts and assessments can be deleted only inside a transaction that has
--     set layernet.audited_delete = 'on' (the admin-only, audited path, D6);
--   * an assessment belongs to a transaction in the same workspace;
--   * the score-semantics rules of RiskAssessmentSchema hold for every row.
--
-- Applied migrations are immutable: the runner refuses to start if this
-- file's SHA-256 differs from the one recorded when it was applied. Changes
-- go in a new numbered migration.

CREATE TABLE workspaces (
  id          uuid PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Authenticated principals, keyed by OIDC issuer + subject. Never derived from
-- transaction data such as account references.
CREATE TABLE users (
  id            uuid PRIMARY KEY,
  issuer        text NOT NULL CHECK (char_length(issuer) BETWEEN 1 AND 2048),
  subject       text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  display_name  text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 120),
  created_at    timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz,
  UNIQUE (issuer, subject)
);

CREATE TABLE memberships (
  workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id),
  role          text NOT NULL CHECK (role IN ('viewer', 'analyst', 'lead', 'admin')),
  granted_at    timestamptz NOT NULL DEFAULT now(),
  granted_by    uuid NOT NULL REFERENCES users (id),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);

CREATE TABLE transaction_facts (
  id                     uuid PRIMARY KEY,
  workspace_id           uuid NOT NULL REFERENCES workspaces (id),
  source_transaction_id  text NOT NULL CHECK (char_length(btrim(source_transaction_id)) BETWEEN 1 AND 128),
  event_time             timestamptz NOT NULL,
  amount                 numeric(20, 4) NOT NULL CHECK (amount >= 0),
  currency               char(3) CHECK (currency ~ '^[A-Z]{3}$'),
  type                   text NOT NULL CHECK (char_length(btrim(type)) BETWEEN 1 AND 40),
  account_ref            text CHECK (char_length(account_ref) BETWEEN 1 AND 128),
  channel                text CHECK (char_length(channel) BETWEEN 1 AND 40),
  location               text CHECK (char_length(location) BETWEEN 1 AND 200),
  device_ref             text CHECK (char_length(device_ref) BETWEEN 1 AND 128),
  provenance_kind        text NOT NULL CHECK (provenance_kind IN ('manual-entry', 'api-ingest', 'legacy-local-import')),
  provenance             jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object' AND provenance ->> 'kind' = provenance_kind),
  ingested_at            timestamptz NOT NULL DEFAULT now(),
  -- De-duplication key for imports and API ingest (DATA_CONTRACT_v1 §6).
  UNIQUE (workspace_id, source_transaction_id),
  -- Target of the composite FK from risk_assessments.
  UNIQUE (workspace_id, id),
  -- Currency is mandatory except for legacy local imports (invariant 10, D10).
  CHECK (currency IS NOT NULL OR provenance_kind = 'legacy-local-import')
);
CREATE INDEX transaction_facts_recent_idx ON transaction_facts (workspace_id, event_time DESC);

CREATE TABLE risk_assessments (
  id                      uuid PRIMARY KEY,
  workspace_id            uuid NOT NULL,
  transaction_id          uuid NOT NULL,
  assessor_kind           text NOT NULL CHECK (assessor_kind IN ('rules', 'model')),
  assessor                jsonb NOT NULL CHECK (jsonb_typeof(assessor) = 'object' AND assessor ->> 'kind' = assessor_kind),
  mode                    text NOT NULL CHECK (mode IN ('primary', 'shadow')),
  feature_schema_version  text NOT NULL CHECK (char_length(btrim(feature_schema_version)) BETWEEN 1 AND 80),
  input_sha256            text CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  score                   double precision NOT NULL,
  score_min               double precision NOT NULL,
  score_max               double precision NOT NULL,
  score_semantics         text NOT NULL CHECK (score_semantics IN ('uncalibrated-heuristic', 'uncalibrated-model-score', 'calibrated-probability')),
  calibration_ref         text CHECK (char_length(calibration_ref) BETWEEN 1 AND 120),
  threshold               double precision,
  decision                text NOT NULL CHECK (decision IN ('Clear', 'Review', 'Block')),
  factors                 jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(factors) = 'array'),
  limitations             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(limitations) = 'array'),
  assessed_at             timestamptz,
  recorded_at             timestamptz NOT NULL DEFAULT now(),
  legacy_import           boolean NOT NULL,
  -- An assessment always scores a transaction of its own workspace.
  FOREIGN KEY (workspace_id, transaction_id) REFERENCES transaction_facts (workspace_id, id),
  -- Mirrors RiskAssessmentSchema (DATA_CONTRACT_v1 §3, invariants 1–5).
  CHECK (score_min < score_max),
  CHECK (score >= score_min AND score <= score_max),
  CHECK (assessor_kind <> 'rules' OR score_semantics = 'uncalibrated-heuristic'),
  CHECK (assessor_kind <> 'model' OR assessor ->> 'artifactSha256' ~ '^[0-9a-f]{64}$'),
  CHECK (
    (score_semantics = 'calibrated-probability' AND calibration_ref IS NOT NULL AND score_min = 0 AND score_max = 1)
    OR (score_semantics <> 'calibrated-probability' AND calibration_ref IS NULL)
  ),
  CHECK (legacy_import OR (assessed_at IS NOT NULL AND input_sha256 IS NOT NULL)),
  CHECK (assessed_at IS NULL OR assessed_at <= recorded_at)
);
CREATE INDEX risk_assessments_transaction_idx ON risk_assessments (workspace_id, transaction_id, recorded_at DESC);

CREATE TABLE audit_events (
  id             uuid PRIMARY KEY,
  workspace_id   uuid NOT NULL REFERENCES workspaces (id),
  actor_user_id  uuid NOT NULL REFERENCES users (id),
  action         text NOT NULL CHECK (action IN (
                   'data.imported', 'data.exported', 'data.deleted',
                   'member.granted', 'member.revoked',
                   'session.started', 'session.ended')),
  target_type    text NOT NULL CHECK (char_length(btrim(target_type)) BETWEEN 1 AND 40),
  target_id      text CHECK (char_length(target_id) BETWEEN 1 AND 128),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  details        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX audit_events_workspace_idx ON audit_events (workspace_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------

CREATE FUNCTION layernet_reject_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'layernet: % rows are immutable; record a new row instead', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE FUNCTION layernet_reject_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'layernet: % rows are append-only and cannot be deleted', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- Facts and assessments may be deleted only by the audited admin path (D6),
-- which sets this transaction-local flag next to its data.deleted audit event.
CREATE FUNCTION layernet_require_audited_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('layernet.audited_delete', true), '') <> 'on' THEN
    RAISE EXCEPTION 'layernet: % rows can only be deleted by the audited deletion path', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER transaction_facts_no_update BEFORE UPDATE ON transaction_facts
  FOR EACH ROW EXECUTE FUNCTION layernet_reject_update();
CREATE TRIGGER transaction_facts_audited_delete BEFORE DELETE ON transaction_facts
  FOR EACH ROW EXECUTE FUNCTION layernet_require_audited_delete();
CREATE TRIGGER transaction_facts_no_truncate BEFORE TRUNCATE ON transaction_facts
  FOR EACH STATEMENT EXECUTE FUNCTION layernet_reject_delete();

CREATE TRIGGER risk_assessments_no_update BEFORE UPDATE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION layernet_reject_update();
CREATE TRIGGER risk_assessments_audited_delete BEFORE DELETE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION layernet_require_audited_delete();
CREATE TRIGGER risk_assessments_no_truncate BEFORE TRUNCATE ON risk_assessments
  FOR EACH STATEMENT EXECUTE FUNCTION layernet_reject_delete();

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION layernet_reject_update();
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION layernet_reject_delete();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION layernet_reject_delete();
