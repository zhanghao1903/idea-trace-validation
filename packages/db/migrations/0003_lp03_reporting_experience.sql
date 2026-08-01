ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_aggregate_type_check,
  DROP CONSTRAINT IF EXISTS audit_events_event_type_check;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_aggregate_type_check
    CHECK (aggregate_type IN ('IDEA', 'PROJECT', 'REPORT')),
  ADD CONSTRAINT audit_events_event_type_check CHECK (event_type IN (
    'IDEA_CREATED', 'IDEA_CLARIFIED', 'IDEA_PROMOTED', 'CORRECTION_RECORDED',
    'PROJECT_TRANSITIONED', 'PROJECT_PROGRESS_RECORDED',
    'ATTENTION_ITEM_CREATED', 'ATTENTION_ITEM_UPDATED',
    'ATTENTION_RESPONSE_CORRECTED', 'EVIDENCE_RECORDED',
    'EVIDENCE_CORRECTED', 'EVIDENCE_RETRACTED', 'CONCLUSION_RECORDED',
    'CONFIRMATION_REQUESTED', 'CONFIRMATION_REJECTED',
    'CONCLUSION_CONFIRMED', 'PROJECT_COMPLETED', 'PROJECT_STOPPED',
    'PROJECT_TRANSFERRED', 'PROJECT_REOPENED', 'REPORT_REVISION_ACCEPTED'
  ));

CREATE TABLE project_reports (
  id varchar(30) PRIMARY KEY CHECK (id ~ '^rpt_[0-9A-HJKMNP-TV-Z]{26}$'),
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  current_accepted_revision integer NOT NULL DEFAULT 0
    CHECK (current_accepted_revision >= 0),
  current_renderable_revision integer,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, project_id),
  UNIQUE (id, project_id, workspace_id),
  CHECK (
    current_renderable_revision IS NULL
    OR (
      current_renderable_revision >= 1
      AND current_renderable_revision <= current_accepted_revision
    )
  )
);

CREATE TABLE report_revisions (
  report_id varchar(30) NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  project_id varchar(31) NOT NULL,
  workspace_id varchar(64) NOT NULL,
  previous_revision integer,
  schema_version varchar(32) NOT NULL,
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  source_document jsonb NOT NULL CHECK (jsonb_typeof(source_document) = 'object'),
  render_model jsonb NOT NULL CHECK (jsonb_typeof(render_model) = 'object'),
  render_status varchar(24) NOT NULL
    CHECK (render_status IN ('RENDERABLE', 'UNSUPPORTED')),
  compiler_version varchar(64) NOT NULL,
  submitted_by_type varchar(16) NOT NULL CHECK (submitted_by_type = 'AI'),
  submitted_by_role varchar(16) NOT NULL CHECK (submitted_by_role = 'EXECUTOR'),
  submitted_by_display_name varchar(120) NOT NULL
    CHECK (length(btrim(submitted_by_display_name)) BETWEEN 1 AND 120),
  submitted_by_client varchar(120)
    CHECK (
      submitted_by_client IS NULL
      OR length(btrim(submitted_by_client)) BETWEEN 1 AND 120
    ),
  submitted_on_behalf_of_role varchar(16)
    CHECK (submitted_on_behalf_of_role IS NULL),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (report_id, revision),
  FOREIGN KEY (report_id, project_id, workspace_id)
    REFERENCES project_reports(id, project_id, workspace_id),
  FOREIGN KEY (report_id, previous_revision)
    REFERENCES report_revisions(report_id, revision),
  CHECK (
    (revision = 1 AND previous_revision IS NULL)
    OR (revision > 1 AND previous_revision = revision - 1)
  ),
  CHECK (source_document->>'projectId' = project_id)
);
CREATE INDEX report_revisions_project_history_idx
  ON report_revisions(project_id, revision DESC, report_id);

ALTER TABLE project_reports
  ADD CONSTRAINT project_reports_accepted_revision_fk
    FOREIGN KEY (id, current_accepted_revision)
    REFERENCES report_revisions(report_id, revision)
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT project_reports_renderable_revision_fk
    FOREIGN KEY (id, current_renderable_revision)
    REFERENCES report_revisions(report_id, revision)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE report_submission_keys (
  workspace_id varchar(64) NOT NULL REFERENCES workspaces(id),
  project_id varchar(31) NOT NULL REFERENCES validation_projects(id),
  client_request_id varchar(128) NOT NULL,
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  state varchar(16) NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
  response_status smallint,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (workspace_id, project_id, client_request_id),
  CHECK (
    (state = 'IN_PROGRESS' AND response_status IS NULL
      AND response_body IS NULL AND completed_at IS NULL)
    OR
    (state = 'COMPLETED' AND response_status IS NOT NULL
      AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE FUNCTION reject_report_revision_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LP-03 report revisions are append-only'
    USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER report_revisions_append_only
  BEFORE UPDATE OR DELETE ON report_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_report_revision_mutation();
