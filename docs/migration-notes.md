# LP-02 Migration Notes

LP-02 adds `0002_lp02_execution_decisions.sql` after the immutable
`0001_lp01_core.sql`. The ordered migration catalog verifies both IDs and SHA-256
checksums; readiness remains false when either migration is missing, changed or
out of order.

## Upgrade

1. Stop traffic or keep the API behind the readiness gate.
2. Back up any non-disposable database.
3. Run `npm run db:migrate`.
4. Confirm `GET /health/ready` returns `READY`.
5. Start the LP-02 API and use `openapi/lp02.v1.json` for current clients.

The migration is additive for LP-01 data. It widens project `phase`, `status` and
`version` checks, adds nullable current execution projections, and creates
append-only tables for transitions, Evidence, progress, attention, conclusions
and human confirmations. Existing Idea, statement, clarification, project,
idempotency and audit rows keep their IDs and values.

## Compatibility

- All LP-01 routes remain registered.
- Existing `PLANNING / QUEUED / version=1` projects remain valid and can be
  started directly.
- `openapi/lp01.v1.json` is immutable and checked by its pinned digest.
- `openapi/lp02.v1.json` is the current expanded API contract.
- Project reads add execution projections; proposer and executor views still
  share one authority object.
- `HUMAN_CONTROL_TOKEN` is a new required 32-byte base64url secret and must
  differ from `AI_API_TOKEN`.

## Security and data behavior

Human-control authentication creates a short-lived confirmation opportunity.
The decision capability is returned only as a path-scoped
`HttpOnly; Secure; SameSite=Strict` cookie. PostgreSQL stores a capability hash,
the canonical payload digest and bounded summary, never the raw capability or
control tokens.

LP-02 facts and histories are append-only. Limited current projections on
projects, attention items and confirmations are protected by database guards;
direct mutation of immutable fields and deletion of history fail closed.
External Evidence links are metadata only: the service accepts safe HTTPS
locators but never fetches or executes their content.

## Failure and rollback

There is no automatic down migration. Before applying `0002`, normal code
revert is sufficient. After applying it:

- use a forward-fix LP-02 binary, or restore a verified backup;
- do not run an LP-01 binary against the upgraded database, because exact
  migration readiness will intentionally reject the unknown catalog;
- do not delete pending confirmations or historical facts as rollback;
- retry an unknown command result with the same idempotency key and identical
  intent.

Every command writes the business fact, project version, audit event and
terminal idempotency result in one transaction. Fault-injection integration
tests prove those writes roll back together and that same-key recovery produces
one successful result.

## Verification

Use only the isolated test database for reset-based checks:

```bash
npm run db:migrate:test
npm run test:integration
npm run test:acceptance:lp01
npm run test:acceptance:lp02
```

The full evidence record is
[LP-02 verification](./feature/lp-02-execution-decisions/verification.md).
