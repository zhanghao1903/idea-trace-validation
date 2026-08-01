# LP-03 Migration Notes

LP-03 adds `0003_lp03_reporting_experience.sql` after the immutable LP-01 and LP-02
migrations. The LP-01/LP-02 compatibility ledger `schema_migrations` remains the exact two rows seen
by the accepted LP-02 binary; LP-03 records `0003` in `schema_feature_migrations`. Current readiness
verifies both ordered ledgers and every SHA-256 checksum, and remains false when a migration is
missing, changed, extra or out of order.

## Upgrade

1. Stop traffic or keep the API behind the readiness gate.
2. Back up any non-disposable database.
3. Run `npm run db:migrate`.
4. Confirm `GET /health/ready` returns `READY`.
5. Build the Web with `npm run build`.
6. Start the API with `WEB_DIST_DIR=apps/web/dist` when same-origin Web hosting is required.
7. Use `openapi/lp03.v1.json` for current API clients.

The migrator also recognizes the pre-remediation LP-03 layout where a valid `0003` row was written
to `schema_migrations`. It verifies that row's checksum and atomically moves the same applied record
to `schema_feature_migrations`; it does not replay the SQL or discard migration history.

The migration is additive for LP-01/LP-02 data. It extends controlled audit values and creates
`project_reports`, immutable `report_revisions` and `report_submission_keys`. Existing Idea, project,
execution, Evidence, conclusion, confirmation, idempotency and audit rows keep their IDs and values.
Experience views are query projections and add no parallel domain tables.

## Compatibility

- All LP-01 and LP-02 routes remain registered and their frozen OpenAPI artifacts remain pinned.
- `openapi/lp03.v1.json` is the current expanded API contract.
- LP-03 report writes are frozen while a project is completed; the existing LP-02 reopen flow makes
  the project writable again without deleting report history.
- Existing databases without reports return the explicit `EMPTY` report mode.
- Unsupported protocol/compiler revisions remain readable as source/history but are not guessed or
  silently rewritten; current reads return a compatibility mode or a supported fallback.
- `WEB_DIST_DIR` is optional. Without it the API runs normally and does not register SPA routes.

## Security and data behavior

Report submission requires the existing AI bearer and an `Idempotency-Key` equal to body
`clientRequestId`. The credential supplies a closed AI/executor principal; report `generator`
metadata cannot choose audit attribution. PostgreSQL stores immutable source JSON, a server-compiled
safe render model, SHA-256 digest, compiler/schema versions and a bounded actor snapshot.

The Web renders only seven controlled block types and safe Markdown tokens. It never executes report
HTML, scripts, CSS, SVG, templates, remote embeds or dynamic components. Evidence and AttentionItem
references are hydrated from current authoritative records. Project state, confirmation and audit
facts remain outside the dynamic report error boundary.

The scoped LP-02 confirmation cookie stays `HttpOnly; Secure; SameSite=Strict` and path-bound. The
Web never receives its value through JavaScript, URL parameters, response bodies or diagnostics.
Static hosting uses a strict self-only CSP, immutable hashed assets and a no-cache application shell.

## Failure and rollback

There is no automatic down migration. Before applying `0003`, normal code revert is sufficient.
After applying it:

- the unmodified LP-02 binary at merge `644af4f186b054a9c5d1c6db087a97e009f545a3` may run against
  the additive schema; it sees its unchanged, exact 0001/0002 migration ledger and the report tables
  remain dormant because the old binary has no report routes;
- current LP-03 readiness continues to require the valid `0003` feature-ledger row, so a missing,
  changed or extra record cannot authorize the current binary;
- do not delete report revisions, submission keys or audit history as rollback;
- correct a bad accepted report with a new revision;
- retry an unknown submit result with the same project, idempotency key and identical content.

Report validation, revision insert, accepted/renderable pointers, audit event and stored idempotent
result share one transaction. Deterministic failpoint tests prove post-revision, post-pointer and
post-audit failures leave no partial success and that the same key can recover once.

## Verification

Use only the isolated test database for reset-based checks:

```bash
npm run db:migrate:test
npm run test:integration
npm run test:acceptance:lp01
npm run test:acceptance:lp02
npm run test:acceptance:lp03
npm run test:web:component
npm run test:browser
```

The full evidence record is
[LP-03 verification](./feature/lp-03-reporting-role-experience/verification.md).
