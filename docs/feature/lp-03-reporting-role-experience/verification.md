# LP-03 Verification Record

- Feature: `lp-03-reporting-role-experience-9c4d7e1a6b20`
- Branch: `codex/lp-03-reporting-role-experience`
- Runtime baseline: `644af4f186b054a9c5d1c6db087a97e009f545a3`
- Confirmed requirements: `e8149c722f4c2eb88596fc8a80ab31cfae3bb436`
- Approved plan: `4d642f95fa8c6886eee312cb118b8d4605a2a7f1`
- Approved composite digest:
  `2be2b770e7658b39b08540df0df64b289602cd1b1f0041483bb639134cda47da`
- Functional implementation head before documentation evidence:
  `ce6ad2092fcf0e2b5967a48e62d3fa9c4450c987`
- Evidence captured: 2026-08-01 (Asia/Shanghai)

## Exact-head binding

This file records reproducible commands and objective outcomes. The immutable `CodeReviewRequest`
and PR checks bind those commands to the final PR head and base. A commit cannot embed its own SHA in
its tree without changing that SHA, so this record does not invent a self-referential head value.
Review must use the exact head in the lifecycle envelope and reject stale CI or local evidence.

## Delivered behavior

- Canonical Draft 2020-12 report schema, generated TypeScript type, strict structural/semantic/safety
  validation, safe Markdown token compiler and seven frozen block types.
- Additive LP-03 migration, immutable report revisions, closed AI/executor principal attribution,
  idempotent/concurrent submit handling, rollback failpoints and append-only audit.
- Report submit/current/history/revision APIs and pinned `openapi/lp03.v1.json`, while LP-01/LP-02
  artifacts remain unchanged.
- Authoritative proposer/executor pagination and project-detail projections with no persisted parallel
  role state and no N+1 preview loading.
- React role overviews, deep-linked project details, fixed authority region, generic report renderer,
  runtime fallback, scoped confirmation page and strict same-origin static hosting.
- Loading, empty, 404, readiness/API failure, labelled stale data, keyboard and narrow-screen states.

## Objective results

The following commands completed successfully against the isolated local test database where
applicable:

| Command | Result |
| --- | --- |
| `npm ci` using npm 11.16.0 | PASS; 364 locked packages installed without `--force` or legacy peer bypass |
| `npm run db:migrate:test` | PASS; `0003_lp03_reporting_experience` present in the feature ledger and idempotently recognized |
| `npm run report-types:check` | PASS; generated report type matches the canonical schema |
| `npm run openapi:check` | PASS; LP-01/LP-02 immutable digests current and LP-03 current |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS, including Playwright sources |
| `npm run build` | PASS; API/packages and production Web built; Web JavaScript 97.35 KiB gzip |
| `npm run test:unit` | PASS; 37/37 |
| `npm run test:contract` | PASS; 21/21, including recursive safe-render counterexamples, exact LP-02 closure and LP-03 readiness facts |
| `npm run test:integration` | PASS; 31/31 |
| `npm run test:acceptance:lp01` | PASS; 2/2 |
| `npm run test:acceptance:lp02` | PASS; 2/2 |
| `npm run test:acceptance:lp03` | PASS; 6/6 |
| `npm run test:web:component` | PASS; 8 report/role/confirmation component cases plus static-hosting unit coverage in the unit suite |
| `npm run test:browser` | PASS; 7/7 Chromium scenarios |
| `npm run verify` | PASS; full ordered gate above completed after both Cycle 1 remediations |
| `npm audit --omit=dev` | REVIEWED; reports [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) through `react-router-dom` 7.18.2, but the advisory explicitly affects only unstable RSC APIs and this SPA imports no RSC/server-action API |

## Security and recovery evidence

- Invalid schema, unknown blocks/fields, unsafe Markdown/URLs, invalid references and complexity
  violations are rejected before persistence with bounded paths and no dangerous value echo.
- The public response contract registers separate recursive safe-inline-token and safe-Markdown-block
  schemas. Production `compileReportView` output for ordinary and nested lists passes that contract
  and the actual current/revision Fastify serializers return 200. A nested `javascript:` link and an
  unknown nested HTML token still fail; generated OpenAPI references the same two closed components
  rather than emitting unconstrained children.
- Same-key same-content replay creates one revision; different content conflicts; lock contention maps
  to retryable in-progress; stale revision and completed project paths fail without partial writes.
- Post-revision, post-pointer and post-audit failpoints roll back revision, pointer, audit and terminal
  idempotency state, then allow same-key recovery.
- Browser tests prove a scoped HttpOnly confirmation capability is absent from URL, DOM,
  `document.cookie`, console and request body; missing capability exposes no decision controls.
- A forced primary renderer exception leaves the authority region intact and uses only the supplied
  independently hydrated runtime fallback; null fallback produces a safe empty state.
- Playwright traces, screenshots and video are disabled so capability-bearing runs do not create
  secret-bearing artifacts.

The React Router advisory is tracked as non-applicable to this implementation, not silently ignored:
the app uses browser routing only, has no React Server Components or Server Actions, and exposes all
writes through the existing explicit API/capability boundaries. The patched line is React Router
8.3.0, a major-version change outside the exact approved dependency plan; adopting it requires a
separate compatibility review rather than `npm audit fix --force`.

## Compatibility and delivery disposition

LP-01 and LP-02 acceptance suites remain green after the additive migration. LP-02 is durably closed
as `ACCEPTED_NO_PUBLISH` at merge `644af4f186b054a9c5d1c6db087a97e009f545a3`, acceptance
`b63ec86101008217bfa6eab6bbeda41713735e7099b051a2a7e21f3026321cba`, closure
`418d1de3689d1bef9a1ce3ee2abf88cb3e44cd1976dc3ec40c2e15f7b63d5061`, with release targets `[]`.

The LP-01/LP-02 migration ledger remains the exact two IDs and checksums expected by the prior LP-02
binary. `0003` is held in a separately strict feature ledger used by LP-03 readiness. The integration
regression reproduces the pre-remediation one-ledger layout, runs the current migrator, proves it
moves the checksum-verified record without replay, then executes the exact LP-02 two-row readiness
comparison as `READY`; it also proves extra rows in either ledger make LP-03 not ready. This makes the
approved old-binary application rollback executable without deleting report data or migration
history.

LP-03 is only `Ready for Acceptance`. It has not been approved, merged, published, deployed or
formally accepted by this record. The confirmed scope has no publication target; any later
acceptance-only/no-publish transition requires separate user authorization for the exact merge commit.
