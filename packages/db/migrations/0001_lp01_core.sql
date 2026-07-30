CREATE TABLE IF NOT EXISTS schema_migrations (
  id varchar(128) PRIMARY KEY,
  checksum char(64) NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE workspaces (
  id varchar(64) PRIMARY KEY,
  display_name varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO workspaces (id, display_name)
VALUES ('workspace_default', 'LP-01 Demo Workspace');

CREATE TABLE ideas (
  id varchar(31) PRIMARY KEY CHECK (id ~ '^idea_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  intent_summary varchar(4000) NOT NULL CHECK (length(intent_summary) BETWEEN 1 AND 4000),
  proposer_actor_type varchar(16) NOT NULL CHECK (proposer_actor_type IN ('HUMAN', 'AI')),
  proposer_role varchar(16) NOT NULL CHECK (proposer_role = 'PROPOSER'),
  proposer_display_name varchar(120) NOT NULL CHECK (length(proposer_display_name) BETWEEN 1 AND 120),
  proposer_client varchar(120),
  desired_outcome varchar(2000),
  intake_status varchar(32) NOT NULL CHECK (intake_status IN ('IDEA', 'NEEDS_CLARIFICATION')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  project_id varchar(31),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX ideas_project_unique ON ideas(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX ideas_workspace_updated_idx ON ideas(workspace_id, updated_at DESC, id DESC);

CREATE TABLE idea_statements (
  id varchar(31) PRIMARY KEY CHECK (id ~ '^stmt_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  idea_id varchar(31) NOT NULL REFERENCES ideas(id),
  kind varchar(16) NOT NULL CHECK (kind IN ('FACT', 'HYPOTHESIS')),
  text varchar(2000) NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  source_type varchar(32) NOT NULL CHECK (source_type IN ('CREATE_REQUEST', 'CLARIFICATION_ANSWER', 'CORRECTION')),
  source_ref varchar(128) NOT NULL,
  supersedes_statement_id varchar(31) REFERENCES idea_statements(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX idea_statements_supersedes_unique
  ON idea_statements(supersedes_statement_id) WHERE supersedes_statement_id IS NOT NULL;
CREATE INDEX idea_statements_idea_idx ON idea_statements(idea_id, recorded_at, id);
ALTER TABLE idea_statements
  ADD CONSTRAINT idea_statements_identity_unique UNIQUE (id, idea_id, kind);
ALTER TABLE idea_statements
  ADD CONSTRAINT idea_statements_supersedes_same_aggregate_fk
  FOREIGN KEY (supersedes_statement_id, idea_id, kind)
  REFERENCES idea_statements(id, idea_id, kind);

CREATE TABLE clarification_questions (
  id varchar(31) PRIMARY KEY CHECK (id ~ '^ques_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  idea_id varchar(31) NOT NULL REFERENCES ideas(id),
  prompt varchar(1000) NOT NULL CHECK (length(prompt) BETWEEN 1 AND 1000),
  target_field varchar(32) NOT NULL CHECK (target_field IN ('DESIRED_OUTCOME', 'HYPOTHESIS', 'FACT', 'OTHER')),
  source varchar(16) NOT NULL CHECK (source IN ('CALLER', 'SYSTEM')),
  status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ANSWERED')),
  current_answer_id varchar(30),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX clarification_questions_idea_idx
  ON clarification_questions(idea_id, created_at, id);
ALTER TABLE clarification_questions
  ADD CONSTRAINT clarification_questions_identity_unique UNIQUE (id, idea_id);
CREATE UNIQUE INDEX clarification_questions_system_open_unique
  ON clarification_questions(idea_id, target_field)
  WHERE source = 'SYSTEM' AND status = 'OPEN';

CREATE TABLE clarification_answers (
  id varchar(30) PRIMARY KEY CHECK (id ~ '^ans_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  idea_id varchar(31) NOT NULL REFERENCES ideas(id),
  question_id varchar(31) NOT NULL REFERENCES clarification_questions(id),
  answer_text varchar(4000) NOT NULL CHECK (length(answer_text) BETWEEN 1 AND 4000),
  desired_outcome_revision varchar(2000),
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('HUMAN', 'AI')),
  actor_role varchar(16) NOT NULL CHECK (actor_role IN ('PROPOSER', 'EXECUTOR', 'MAINTAINER')),
  actor_display_name varchar(120) NOT NULL,
  actor_client varchar(120),
  on_behalf_of_role varchar(16) CHECK (on_behalf_of_role IN ('PROPOSER', 'EXECUTOR', 'MAINTAINER')),
  reason varchar(500) NOT NULL,
  supersedes_answer_id varchar(30) REFERENCES clarification_answers(id),
  resulting_idea_version integer NOT NULL CHECK (resulting_idea_version >= 2),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX clarification_answers_supersedes_unique
  ON clarification_answers(supersedes_answer_id) WHERE supersedes_answer_id IS NOT NULL;
CREATE INDEX clarification_answers_question_idx
  ON clarification_answers(question_id, created_at, id);
ALTER TABLE clarification_answers
  ADD CONSTRAINT clarification_answers_identity_unique
  UNIQUE (id, question_id, idea_id);
ALTER TABLE clarification_answers
  ADD CONSTRAINT clarification_answers_question_same_idea_fk
  FOREIGN KEY (question_id, idea_id)
  REFERENCES clarification_questions(id, idea_id);
ALTER TABLE clarification_answers
  ADD CONSTRAINT clarification_answers_supersedes_same_question_fk
  FOREIGN KEY (supersedes_answer_id, question_id, idea_id)
  REFERENCES clarification_answers(id, question_id, idea_id);
ALTER TABLE clarification_questions
  ADD CONSTRAINT clarification_questions_current_answer_fk
  FOREIGN KEY (current_answer_id, id, idea_id)
  REFERENCES clarification_answers(id, question_id, idea_id);

CREATE TABLE validation_projects (
  id varchar(31) PRIMARY KEY CHECK (id ~ '^proj_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  idea_id varchar(31) NOT NULL UNIQUE REFERENCES ideas(id),
  goal varchar(2000) NOT NULL,
  phase varchar(16) NOT NULL CHECK (phase = 'PLANNING'),
  status varchar(16) NOT NULL CHECK (status = 'QUEUED'),
  source_idea_version integer NOT NULL CHECK (source_idea_version >= 1),
  version integer NOT NULL DEFAULT 1 CHECK (version = 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX validation_projects_workspace_updated_idx
  ON validation_projects(workspace_id, updated_at DESC, id DESC);
ALTER TABLE validation_projects
  ADD CONSTRAINT validation_projects_identity_unique UNIQUE (id, idea_id);
ALTER TABLE ideas
  ADD CONSTRAINT ideas_project_same_idea_fk
  FOREIGN KEY (project_id, id) REFERENCES validation_projects(id, idea_id);

CREATE TABLE project_hypotheses (
  id varchar(30) PRIMARY KEY CHECK (id ~ '^hyp_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  source_statement_id varchar(31) NOT NULL REFERENCES idea_statements(id),
  text varchar(2000) NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 19),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id, source_statement_id),
  UNIQUE(project_id, position)
);

CREATE FUNCTION enforce_project_hypothesis_source() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM validation_projects project
    JOIN idea_statements statement ON statement.idea_id = project.idea_id
    WHERE project.id = NEW.project_id
      AND statement.id = NEW.source_statement_id
      AND project.workspace_id = NEW.workspace_id
      AND statement.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'project hypothesis source must belong to the source Idea'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER project_hypotheses_source_guard
BEFORE INSERT OR UPDATE ON project_hypotheses
FOR EACH ROW EXECUTE FUNCTION enforce_project_hypothesis_source();

CREATE TABLE idempotency_records (
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  idempotency_key varchar(128) NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._~:+/-]+$'),
  operation varchar(64) NOT NULL,
  route_template varchar(160) NOT NULL,
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  first_request_id varchar(30) NOT NULL CHECK (first_request_id ~ '^req_[0-9A-HJKMNP-TV-Z]{26}$'),
  status varchar(16) NOT NULL CHECK (status IN ('IN_PROGRESS', 'SUCCEEDED', 'REJECTED')),
  response_status smallint,
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY(workspace_id, idempotency_key),
  CHECK (
    (status = 'IN_PROGRESS' AND response_status IS NULL AND response_payload IS NULL AND completed_at IS NULL)
    OR
    (status IN ('SUCCEEDED', 'REJECTED') AND response_status BETWEEN 100 AND 599
      AND response_payload IS NOT NULL AND completed_at IS NOT NULL
      AND octet_length(response_payload::text) <= 262144)
  )
);

CREATE TABLE audit_events (
  id varchar(30) PRIMARY KEY CHECK (id ~ '^evt_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  aggregate_type varchar(16) NOT NULL CHECK (aggregate_type IN ('IDEA', 'PROJECT')),
  aggregate_id varchar(31) NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version >= 1),
  event_type varchar(48) NOT NULL CHECK (event_type IN ('IDEA_CREATED', 'IDEA_CLARIFIED', 'IDEA_PROMOTED', 'CORRECTION_RECORDED')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('HUMAN', 'AI', 'SYSTEM')),
  actor_role varchar(16) NOT NULL CHECK (actor_role IN ('PROPOSER', 'EXECUTOR', 'MAINTAINER', 'SYSTEM')),
  actor_display_name varchar(120) NOT NULL,
  actor_client varchar(120),
  on_behalf_of_role varchar(16) CHECK (on_behalf_of_role IN ('PROPOSER', 'EXECUTOR', 'MAINTAINER')),
  reason varchar(500) NOT NULL,
  request_id varchar(30) NOT NULL CHECK (request_id ~ '^req_[0-9A-HJKMNP-TV-Z]{26}$'),
  idempotency_key varchar(128) NOT NULL,
  before_summary jsonb CHECK (before_summary IS NULL OR octet_length(before_summary::text) <= 16384),
  after_summary jsonb NOT NULL CHECK (octet_length(after_summary::text) <= 16384),
  related_event_id varchar(30) REFERENCES audit_events(id)
);

CREATE INDEX audit_events_aggregate_idx
  ON audit_events(aggregate_type, aggregate_id, occurred_at, id);
CREATE INDEX audit_events_request_idx ON audit_events(request_id);

CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
