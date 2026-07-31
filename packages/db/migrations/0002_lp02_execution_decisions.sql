ALTER TABLE validation_projects
  DROP CONSTRAINT IF EXISTS validation_projects_phase_check,
  DROP CONSTRAINT IF EXISTS validation_projects_status_check,
  DROP CONSTRAINT IF EXISTS validation_projects_version_check;

ALTER TABLE validation_projects
  ADD CONSTRAINT validation_projects_phase_check
    CHECK (phase IN ('PLANNING', 'BUILDING', 'VALIDATING', 'CONCLUDING')),
  ADD CONSTRAINT validation_projects_status_check
    CHECK (status IN ('QUEUED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED')),
  ADD CONSTRAINT validation_projects_version_check CHECK (version >= 1),
  ADD COLUMN current_next_step varchar(2000),
  ADD COLUMN latest_progress_update_id varchar(31),
  ADD COLUMN active_conclusion_id varchar(31),
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN completion_kind varchar(16)
    CHECK (completion_kind IN ('COMPLETE', 'STOP', 'TRANSFER')),
  ADD CONSTRAINT validation_projects_completion_projection_check CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL AND completion_kind IS NOT NULL)
    OR
    (status <> 'COMPLETED' AND completed_at IS NULL AND completion_kind IS NULL)
  );

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_event_type_check;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_event_type_check CHECK (event_type IN (
    'IDEA_CREATED', 'IDEA_CLARIFIED', 'IDEA_PROMOTED', 'CORRECTION_RECORDED',
    'PROJECT_TRANSITIONED', 'PROJECT_PROGRESS_RECORDED',
    'ATTENTION_ITEM_CREATED', 'ATTENTION_ITEM_UPDATED', 'ATTENTION_RESPONSE_CORRECTED',
    'EVIDENCE_RECORDED', 'EVIDENCE_CORRECTED', 'EVIDENCE_RETRACTED',
    'CONCLUSION_RECORDED', 'CONFIRMATION_REQUESTED', 'CONFIRMATION_REJECTED',
    'CONCLUSION_CONFIRMED', 'PROJECT_COMPLETED', 'PROJECT_STOPPED',
    'PROJECT_TRANSFERRED', 'PROJECT_REOPENED'
  ));

CREATE TABLE project_transitions (
  id varchar(30) PRIMARY KEY CHECK (id ~ '^trn_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  kind varchar(24) NOT NULL CHECK (kind IN (
    'START', 'PAUSE', 'RESUME', 'CHANGE_PHASE',
    'COMPLETE', 'STOP', 'TRANSFER', 'REOPEN'
  )),
  from_status varchar(16) NOT NULL,
  to_status varchar(16) NOT NULL,
  from_phase varchar(16) NOT NULL,
  to_phase varchar(16) NOT NULL,
  explanation varchar(2000) NOT NULL CHECK (length(explanation) BETWEEN 1 AND 2000),
  next_step varchar(2000),
  conclusion_id varchar(31),
  confirmation_id varchar(34),
  related_transition_id varchar(30),
  resulting_project_version integer NOT NULL CHECK (resulting_project_version >= 2),
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('HUMAN', 'AI')),
  actor_role varchar(16) NOT NULL CHECK (actor_role IN ('PROPOSER', 'EXECUTOR', 'MAINTAINER')),
  actor_display_name varchar(120) NOT NULL,
  actor_client varchar(120),
  on_behalf_of_role varchar(16),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, project_id),
  UNIQUE (project_id, resulting_project_version)
);
CREATE INDEX project_transitions_history_idx
  ON project_transitions(project_id, resulting_project_version, id);

CREATE TABLE evidence_items (
  id varchar(30) PRIMARY KEY CHECK (id ~ '^evd_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  kind varchar(16) NOT NULL CHECK (kind IN ('LINK', 'ARTIFACT', 'METRIC', 'NOTE')),
  title varchar(300) NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  summary varchar(2000) NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
  locator varchar(2048),
  metric_name varchar(200),
  metric_value varchar(200),
  metric_unit varchar(80),
  captured_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('HUMAN', 'AI')),
  actor_role varchar(16) NOT NULL CHECK (actor_role IN ('PROPOSER', 'EXECUTOR', 'MAINTAINER')),
  actor_display_name varchar(120) NOT NULL,
  actor_client varchar(120),
  on_behalf_of_role varchar(16),
  replaces_evidence_id varchar(30),
  resulting_project_version integer NOT NULL CHECK (resulting_project_version >= 2),
  UNIQUE (id, project_id),
  UNIQUE (project_id, resulting_project_version),
  UNIQUE (replaces_evidence_id),
  CONSTRAINT evidence_replaces_same_project_fk
    FOREIGN KEY (replaces_evidence_id, project_id)
    REFERENCES evidence_items(id, project_id),
  CHECK (
    (kind = 'LINK' AND locator LIKE 'https://%' AND metric_name IS NULL AND metric_value IS NULL)
    OR (kind = 'ARTIFACT' AND locator ~ '^artifact_[0-9A-HJKMNP-TV-Z]{26}$'
      AND metric_name IS NULL AND metric_value IS NULL)
    OR (kind = 'METRIC' AND locator IS NULL AND metric_name IS NOT NULL AND metric_value IS NOT NULL)
    OR (kind = 'NOTE' AND locator IS NULL AND metric_name IS NULL AND metric_value IS NULL AND metric_unit IS NULL)
  )
);
CREATE INDEX evidence_project_history_idx
  ON evidence_items(project_id, resulting_project_version, id);

CREATE TABLE evidence_events (
  id varchar(30) PRIMARY KEY CHECK (id ~ '^evt_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  evidence_id varchar(30) NOT NULL,
  kind varchar(16) NOT NULL CHECK (kind IN ('CORRECT', 'RETRACT')),
  replacement_evidence_id varchar(30),
  reason varchar(500) NOT NULL,
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('HUMAN', 'AI')),
  actor_role varchar(16) NOT NULL,
  actor_display_name varchar(120) NOT NULL,
  actor_client varchar(120),
  on_behalf_of_role varchar(16),
  resulting_project_version integer NOT NULL CHECK (resulting_project_version >= 2),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (evidence_id, project_id) REFERENCES evidence_items(id, project_id),
  FOREIGN KEY (replacement_evidence_id, project_id) REFERENCES evidence_items(id, project_id),
  UNIQUE (evidence_id),
  CHECK (
    (kind = 'CORRECT' AND replacement_evidence_id IS NOT NULL)
    OR (kind = 'RETRACT' AND replacement_evidence_id IS NULL)
  )
);

CREATE TABLE progress_updates (
  id varchar(31) PRIMARY KEY CHECK (id ~ '^prog_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  sequence integer NOT NULL CHECK (sequence >= 1),
  summary varchar(2000) NOT NULL,
  completed_work jsonb NOT NULL CHECK (
    jsonb_typeof(completed_work) = 'array'
    AND jsonb_array_length(completed_work) BETWEEN 1 AND 20
  ),
  next_step varchar(2000) NOT NULL,
  project_status_at_submission varchar(16) NOT NULL,
  phase_at_submission varchar(16) NOT NULL,
  occurred_at timestamptz NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('HUMAN', 'AI')),
  actor_role varchar(16) NOT NULL,
  actor_display_name varchar(120) NOT NULL,
  actor_client varchar(120),
  on_behalf_of_role varchar(16),
  corrects_progress_id varchar(31),
  resulting_project_version integer NOT NULL CHECK (resulting_project_version >= 2),
  UNIQUE (id, project_id),
  UNIQUE (project_id, sequence),
  UNIQUE (project_id, resulting_project_version),
  UNIQUE (corrects_progress_id),
  FOREIGN KEY (corrects_progress_id, project_id)
    REFERENCES progress_updates(id, project_id)
);
CREATE TABLE progress_update_evidence (
  progress_update_id varchar(31) NOT NULL,
  project_id varchar(31) NOT NULL,
  evidence_id varchar(30) NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 19),
  PRIMARY KEY (progress_update_id, evidence_id),
  UNIQUE (progress_update_id, position),
  FOREIGN KEY (progress_update_id, project_id)
    REFERENCES progress_updates(id, project_id),
  FOREIGN KEY (evidence_id, project_id)
    REFERENCES evidence_items(id, project_id)
);

CREATE TABLE attention_items (
  id varchar(31) PRIMARY KEY CHECK (id ~ '^attn_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  type varchar(24) NOT NULL CHECK (type IN ('BLOCKER', 'DECISION_REQUEST', 'SUPPORT_REQUEST')),
  title varchar(300) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'NEEDS_INFO', 'RESOLVED', 'CLOSED')),
  background varchar(2000),
  impact varchar(2000),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation varchar(1000),
  decision_impact varchar(2000),
  waiting_for_role varchar(16),
  support_needed varchar(2000),
  request_reason varchar(2000),
  expected_responder_role varchar(16),
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('HUMAN', 'AI')),
  actor_role varchar(16) NOT NULL,
  actor_display_name varchar(120) NOT NULL,
  actor_client varchar(120),
  on_behalf_of_role varchar(16),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  resulting_project_version integer NOT NULL CHECK (resulting_project_version >= 2),
  UNIQUE (id, project_id),
  UNIQUE (project_id, resulting_project_version),
  CHECK (
    (type = 'BLOCKER' AND background IS NOT NULL AND impact IS NOT NULL)
    OR (type = 'DECISION_REQUEST' AND background IS NOT NULL
      AND decision_impact IS NOT NULL AND waiting_for_role IS NOT NULL
      AND (jsonb_array_length(options) > 0 OR recommendation IS NOT NULL))
    OR (type = 'SUPPORT_REQUEST' AND support_needed IS NOT NULL
      AND request_reason IS NOT NULL AND impact IS NOT NULL
      AND expected_responder_role IS NOT NULL)
  )
);
CREATE INDEX attention_open_idx
  ON attention_items(project_id, status, resulting_project_version DESC);

CREATE TABLE attention_events (
  id varchar(33) PRIMARY KEY CHECK (id ~ '^atnevt_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  attention_item_id varchar(31) NOT NULL,
  kind varchar(24) NOT NULL CHECK (kind IN (
    'COMMENT', 'REQUEST_INFO', 'PROVIDE_INFO', 'RESOLVE', 'CLOSE', 'CORRECT_RESPONSE'
  )),
  message varchar(2000) NOT NULL,
  from_status varchar(16) NOT NULL,
  to_status varchar(16) NOT NULL,
  resolution varchar(2000),
  selected_option varchar(500),
  decision_text varchar(2000),
  support_summary varchar(2000),
  corrects_event_id varchar(33),
  corrected_kind varchar(24),
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('HUMAN', 'AI')),
  actor_role varchar(16) NOT NULL,
  actor_display_name varchar(120) NOT NULL,
  actor_client varchar(120),
  on_behalf_of_role varchar(16),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resulting_project_version integer NOT NULL CHECK (resulting_project_version >= 2),
  UNIQUE (id, attention_item_id, project_id),
  UNIQUE (project_id, resulting_project_version),
  UNIQUE (corrects_event_id),
  FOREIGN KEY (attention_item_id, project_id)
    REFERENCES attention_items(id, project_id),
  FOREIGN KEY (corrects_event_id, attention_item_id, project_id)
    REFERENCES attention_events(id, attention_item_id, project_id),
  CHECK (
    (kind = 'CORRECT_RESPONSE' AND corrects_event_id IS NOT NULL AND corrected_kind IS NOT NULL
      AND from_status = to_status)
    OR (kind <> 'CORRECT_RESPONSE' AND corrects_event_id IS NULL AND corrected_kind IS NULL)
  )
);

CREATE TABLE validation_conclusions (
  id varchar(31) PRIMARY KEY CHECK (id ~ '^conc_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  sequence integer NOT NULL CHECK (sequence >= 1),
  evidence_summary varchar(4000) NOT NULL,
  limitations jsonb NOT NULL,
  uncertainties jsonb NOT NULL,
  recommendation varchar(16) NOT NULL CHECK (recommendation IN ('CONTINUE', 'ADJUST', 'STOP', 'TRANSFER')),
  recommendation_note varchar(2000) NOT NULL,
  supplemental_note varchar(2000),
  supersedes_conclusion_id varchar(31),
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('HUMAN', 'AI')),
  actor_role varchar(16) NOT NULL,
  actor_display_name varchar(120) NOT NULL,
  actor_client varchar(120),
  on_behalf_of_role varchar(16),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resulting_project_version integer NOT NULL CHECK (resulting_project_version >= 2),
  UNIQUE (id, project_id),
  UNIQUE (project_id, sequence),
  UNIQUE (supersedes_conclusion_id),
  FOREIGN KEY (supersedes_conclusion_id, project_id)
    REFERENCES validation_conclusions(id, project_id),
  CHECK (jsonb_array_length(limitations) BETWEEN 1 AND 20),
  CHECK (jsonb_array_length(uncertainties) BETWEEN 1 AND 20)
);
CREATE TABLE conclusion_evidence (
  conclusion_id varchar(31) NOT NULL,
  project_id varchar(31) NOT NULL,
  evidence_id varchar(30) NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 49),
  PRIMARY KEY (conclusion_id, evidence_id),
  UNIQUE (conclusion_id, position),
  FOREIGN KEY (conclusion_id, project_id)
    REFERENCES validation_conclusions(id, project_id),
  FOREIGN KEY (evidence_id, project_id)
    REFERENCES evidence_items(id, project_id)
);
CREATE TABLE conclusion_state_events (
  id varchar(30) PRIMARY KEY CHECK (id ~ '^evt_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  conclusion_id varchar(31) NOT NULL,
  status varchar(24) NOT NULL CHECK (status IN (
    'DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'SUPERSEDED'
  )),
  confirmation_id varchar(34),
  reason varchar(500) NOT NULL,
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('HUMAN', 'AI', 'SYSTEM')),
  actor_role varchar(16) NOT NULL,
  actor_display_name varchar(120) NOT NULL,
  actor_client varchar(120),
  on_behalf_of_role varchar(16),
  resulting_project_version integer NOT NULL CHECK (resulting_project_version >= 2),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (conclusion_id, project_id)
    REFERENCES validation_conclusions(id, project_id)
);

CREATE TABLE human_confirmations (
  id varchar(34) PRIMARY KEY CHECK (id ~ '^confirm_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  operation varchar(32) NOT NULL CHECK (operation IN (
    'CONFIRM_CONCLUSION', 'COMPLETE_PROJECT', 'STOP_PROJECT',
    'TRANSFER_PROJECT', 'REOPEN_PROJECT'
  )),
  conclusion_id varchar(31),
  terminal_transition_id varchar(30),
  completion_summary varchar(2000),
  reopen_reason varchar(2000),
  next_step varchar(2000),
  payload_digest char(64) NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  payload_summary jsonb NOT NULL CHECK (octet_length(payload_summary::text) <= 65536),
  expected_project_version integer NOT NULL CHECK (expected_project_version >= 2),
  capability_hash char(64) NOT NULL CHECK (capability_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  decision varchar(16) NOT NULL DEFAULT 'PENDING'
    CHECK (decision IN ('PENDING', 'APPROVED', 'REJECTED')),
  decided_actor_type varchar(16),
  decided_actor_role varchar(16),
  decided_actor_display_name varchar(120),
  decided_actor_client varchar(120),
  decided_on_behalf_of_role varchar(16),
  decided_at timestamptz,
  decision_note varchar(2000),
  decision_idempotency_key varchar(128),
  resulting_project_version integer,
  confirmation_request_idempotency_key varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, project_id),
  FOREIGN KEY (conclusion_id, project_id)
    REFERENCES validation_conclusions(id, project_id),
  FOREIGN KEY (terminal_transition_id, project_id)
    REFERENCES project_transitions(id, project_id),
  CHECK (
    (operation = 'REOPEN_PROJECT' AND conclusion_id IS NULL
      AND terminal_transition_id IS NOT NULL AND reopen_reason IS NOT NULL AND next_step IS NOT NULL
      AND completion_summary IS NULL)
    OR
    (operation <> 'REOPEN_PROJECT' AND conclusion_id IS NOT NULL
      AND terminal_transition_id IS NULL AND reopen_reason IS NULL AND next_step IS NULL
      AND (
        (operation = 'CONFIRM_CONCLUSION' AND completion_summary IS NULL)
        OR (operation <> 'CONFIRM_CONCLUSION' AND completion_summary IS NOT NULL)
      ))
  ),
  CHECK (
    (decision = 'PENDING' AND decided_at IS NULL AND decision_note IS NULL)
    OR (decision <> 'PENDING' AND decided_at IS NOT NULL AND decision_note IS NOT NULL)
  )
);
CREATE INDEX human_confirmations_project_idx
  ON human_confirmations(project_id, created_at DESC, id DESC);
CREATE INDEX human_confirmations_expiry_idx
  ON human_confirmations(decision, expires_at);

ALTER TABLE validation_projects
  ADD CONSTRAINT validation_projects_latest_progress_fk
    FOREIGN KEY (latest_progress_update_id, id)
    REFERENCES progress_updates(id, project_id),
  ADD CONSTRAINT validation_projects_active_conclusion_fk
    FOREIGN KEY (active_conclusion_id, id)
    REFERENCES validation_conclusions(id, project_id);

ALTER TABLE project_transitions
  ADD CONSTRAINT project_transition_conclusion_fk
    FOREIGN KEY (conclusion_id, project_id)
    REFERENCES validation_conclusions(id, project_id),
  ADD CONSTRAINT project_transition_confirmation_fk
    FOREIGN KEY (confirmation_id, project_id)
    REFERENCES human_confirmations(id, project_id),
  ADD CONSTRAINT project_transition_related_fk
    FOREIGN KEY (related_transition_id, project_id)
    REFERENCES project_transitions(id, project_id);

CREATE FUNCTION reject_lp02_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LP-02 history is append-only' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER project_transitions_append_only
  BEFORE UPDATE OR DELETE ON project_transitions
  FOR EACH ROW EXECUTE FUNCTION reject_lp02_append_only_mutation();
CREATE TRIGGER progress_updates_append_only
  BEFORE UPDATE OR DELETE ON progress_updates
  FOR EACH ROW EXECUTE FUNCTION reject_lp02_append_only_mutation();
CREATE TRIGGER progress_update_evidence_append_only
  BEFORE UPDATE OR DELETE ON progress_update_evidence
  FOR EACH ROW EXECUTE FUNCTION reject_lp02_append_only_mutation();
CREATE TRIGGER attention_events_append_only
  BEFORE UPDATE OR DELETE ON attention_events
  FOR EACH ROW EXECUTE FUNCTION reject_lp02_append_only_mutation();
CREATE TRIGGER evidence_items_append_only
  BEFORE UPDATE OR DELETE ON evidence_items
  FOR EACH ROW EXECUTE FUNCTION reject_lp02_append_only_mutation();
CREATE TRIGGER evidence_events_append_only
  BEFORE UPDATE OR DELETE ON evidence_events
  FOR EACH ROW EXECUTE FUNCTION reject_lp02_append_only_mutation();
CREATE TRIGGER validation_conclusions_append_only
  BEFORE UPDATE OR DELETE ON validation_conclusions
  FOR EACH ROW EXECUTE FUNCTION reject_lp02_append_only_mutation();
CREATE TRIGGER conclusion_evidence_append_only
  BEFORE UPDATE OR DELETE ON conclusion_evidence
  FOR EACH ROW EXECUTE FUNCTION reject_lp02_append_only_mutation();
CREATE TRIGGER conclusion_state_events_append_only
  BEFORE UPDATE OR DELETE ON conclusion_state_events
  FOR EACH ROW EXECUTE FUNCTION reject_lp02_append_only_mutation();

CREATE FUNCTION guard_lp02_attention_item_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LP-02 attention items cannot be deleted'
      USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW.id, NEW.workspace_id, NEW.project_id, NEW.type, NEW.title,
    NEW.background, NEW.impact, NEW.options, NEW.recommendation,
    NEW.decision_impact, NEW.waiting_for_role, NEW.support_needed,
    NEW.request_reason, NEW.expected_responder_role, NEW.actor_type,
    NEW.actor_role, NEW.actor_display_name, NEW.actor_client,
    NEW.on_behalf_of_role, NEW.created_at, NEW.resulting_project_version
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.workspace_id, OLD.project_id, OLD.type, OLD.title,
    OLD.background, OLD.impact, OLD.options, OLD.recommendation,
    OLD.decision_impact, OLD.waiting_for_role, OLD.support_needed,
    OLD.request_reason, OLD.expected_responder_role, OLD.actor_type,
    OLD.actor_role, OLD.actor_display_name, OLD.actor_client,
    OLD.on_behalf_of_role, OLD.created_at, OLD.resulting_project_version
  ) THEN
    RAISE EXCEPTION 'LP-02 attention payload is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER attention_items_guarded_mutation
  BEFORE UPDATE OR DELETE ON attention_items
  FOR EACH ROW EXECUTE FUNCTION guard_lp02_attention_item_mutation();

CREATE FUNCTION guard_lp02_confirmation_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LP-02 confirmations cannot be deleted'
      USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW.id, NEW.workspace_id, NEW.project_id, NEW.operation,
    NEW.conclusion_id, NEW.terminal_transition_id, NEW.completion_summary,
    NEW.reopen_reason, NEW.next_step, NEW.payload_digest, NEW.payload_summary,
    NEW.expected_project_version, NEW.capability_hash, NEW.expires_at,
    NEW.confirmation_request_idempotency_key, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.workspace_id, OLD.project_id, OLD.operation,
    OLD.conclusion_id, OLD.terminal_transition_id, OLD.completion_summary,
    OLD.reopen_reason, OLD.next_step, OLD.payload_digest, OLD.payload_summary,
    OLD.expected_project_version, OLD.capability_hash, OLD.expires_at,
    OLD.confirmation_request_idempotency_key, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'LP-02 confirmation authority is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.decision <> 'PENDING' OR NEW.decision NOT IN ('APPROVED', 'REJECTED')
     OR NEW.decided_actor_type <> 'HUMAN'
     OR NEW.decided_at IS NULL
     OR NEW.decision_note IS NULL
     OR NEW.decision_idempotency_key IS NULL
     OR NEW.resulting_project_version IS NULL THEN
    RAISE EXCEPTION 'LP-02 confirmation decision transition is invalid'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER human_confirmations_guarded_mutation
  BEFORE UPDATE OR DELETE ON human_confirmations
  FOR EACH ROW EXECUTE FUNCTION guard_lp02_confirmation_mutation();
