# LP-03 Migration Notes

LP-03 adds `0003_lp03_reporting_experience.sql` after the immutable LP-01 and LP-02
migrations. The ordered migration catalog verifies every ID and SHA-256 checksum; readiness remains
false when a migration is missing, changed or out of order.

## Upgrade

1. Stop traffic or keep the API behind the readiness gate.
2. Back up any non-disposable database.
3. Run `npm run db:migrate`.
4. Confirm `GET /health/ready` returns `READY`.
5. Build the Web with `npm run build`.
6. Start the API with `WEB_DIST_DIR=apps/web/dist` when same-origin Web hosting is required.
7. Use `openapi/lp03.v1.json` for current API clients.

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

- use a forward-fix LP-03 binary, or restore a verified backup;
- do not run the unmodified LP-02 binary after `0003`: its strict migration catalog correctly reports
  the newer row as a mismatch; use a forward-fix LP-03 build or restore a verified pre-`0003` backup;
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
