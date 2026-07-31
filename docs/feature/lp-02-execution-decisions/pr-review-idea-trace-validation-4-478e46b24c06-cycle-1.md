# PR Review — `zhanghao1903/idea-trace-validation#4` @ `478e46b24c06`

## 1. Review Metadata

| Field | Value |
|---|---|
| Repository | `zhanghao1903/idea-trace-validation` |
| Pull Request | `#4` — `LP-02: project execution and decision loop` |
| Author | `zhanghao1903` |
| Base | `codex/v0-1-project-plan` @ `b562a3c0ede8384afef2007b8057a1250650a39f` |
| Head | `codex/lp-02-execution-decisions` @ `478e46b24c0636b1a476afc5ddbf327275a9ac72` |
| Reviewed at | `2026-07-31T10:05:30Z` |
| Reviewer | `OpenAI Codex Engineering Review` |
| Report status | `CURRENT` |
| Review mode | `READ_ONLY` |
| Review kind | `INITIAL` |

## 2. Decision

- **Decision:** `REQUEST_CHANGES`
- **Mergeable:** `false` for review approval (GitHub reports the exact snapshot `MERGEABLE/CLEAN`)
- **Blocking findings:** `1` (`PRR-001`)
- **Rationale:** The exact head is current, GitHub `ci / verify` is green, and the reviewed contracts, state transitions, confirmation binding, migration constraints, and rollback tests are broadly strong. Approval is withheld because every new LP-02 write path mishandles the documented idempotency-key lock-contention case: after the configured two-second PostgreSQL lock timeout it returns a generic 500 instead of the stable retryable 409 contract.

## 3. Executive Summary

PR #4 implements the LP-02 execution and decision loop across contracts, domain rules, PostgreSQL persistence, human confirmation capabilities, API routes, projections, documentation, and objective tests. The review reconciled all 77 changed paths, independently reproduced the core confirmation and mutation design from source, and refreshed the exact PR head and check state immediately before deciding. One concrete concurrency/recovery defect remains. The new `PostgresProjectExecutionService.runWrite` duplicates the LP-01 idempotency transaction but omits its PostgreSQL `55P03` mapping. A held same-key transaction therefore caused the exact-head transition endpoint to return `500 INTERNAL_ERROR` after 2.1 seconds. This violates LP2-REQ-021 and the stable recovery semantics expected by LP2-AC-003/012; it applies to all LP-02 command routes using this helper.

## 4. Scope and Change Map

### Reviewed scope

- Full `b562a3c0ede8384afef2007b8057a1250650a39f..478e46b24c0636b1a476afc5ddbf327275a9ac72` diff and all 77 changed paths.
- Confirmed requirements, approved design, implementation plan, verification record, migration notes, project-management truth, README, and changelog.
- LP-02 contracts and generated OpenAPI source boundary; project transitions, progress, attention, Evidence, conclusion, history, and human-confirmation routes.
- Domain state matrices, canonical payload digest and capability derivation, access boundaries, cookies, error mapping, redaction, and readiness.
- PostgreSQL migration, append-only/guard triggers, same-project references, project versioning, effective projections, idempotency transactions, confirmation decisions, concurrency, and rollback tests.
- Workspace static/build gates, unit/contract test results, exact-head GitHub check, and a reviewer-created database-backed lock-contention counterexample.

### Excluded or unavailable scope

- `openapi/lp02.v1.json` and the lockfile were source-consistency and boundary checked rather than manually reviewed line by line.
- Reviewer-local full integration and acceptance reruns were unavailable after the local-network escalation was denied; exact-head GitHub `ci / verify` is green and the focused database-backed reproduction did run successfully before that denial.
- Production traffic, real secrets, deployment supervisor behavior, and exhaustive third-party dependency internals are outside this LP-02 review.

### Change map

| Area | Main change | External behavior | Risk | Validation |
|---|---|---|---|---|
| Contracts and API | Adds the LP-02 execution, attention, Evidence, conclusion, history, and confirmation surface | Clients receive strict versioned envelopes and generated OpenAPI | High | Contract tests and OpenAPI drift check pass; route/auth/error paths inspected |
| Persistence and state | Adds migration `0002`, immutable histories, projections, project versioning, and terminal transitions | Execution and decisions become durable and traceable | High | Constraints, triggers, service queries, integration suite, and exact-head CI inspected |
| Human confirmation | Adds dedicated control credential, scoped cookie capability, exact payload digest, expiry, and single-use decisions | High-impact operations require a bound human opportunity | High | Capability code, operation matrix, tamper/stale paths, tests, and secret boundaries inspected |
| Mutation recovery | Adds a new LP-02 idempotent transaction helper | Same-key retries should replay or report in-progress state | High | Happy paths and CI pass; held-key reproduction fails in `PRR-001` |
| Documentation and status | Records LP-01 closure and LP-02 ready-for-acceptance evidence without claiming acceptance | Management truth stays aligned with lifecycle state | Low | Requirements/plan/verification/status diffs reconciled |

## 5. Findings

### PRR-001 — `[S2][Blocking][Concurrency] LP-02 same-key lock contention escapes as HTTP 500`

- **Location:** `packages/db/src/project-execution-service.ts:3118-3120` (`PostgresProjectExecutionService.runWrite`) @ `478e46b24c0636b1a476afc5ddbf327275a9ac72`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** `runWrite` sets `lock_timeout = '2s'`, then attempts `INSERT ... ON CONFLICT DO NOTHING` into `idempotency_records`. When another uncommitted transaction already owns the same key, PostgreSQL waits and raises `55P03`. The LP-02 helper rolls back and rethrows every infrastructure error, whereas the existing LP-01 helper maps `55P03` to the stable retryable `409 IDEMPOTENCY_IN_PROGRESS` result.
- **Trigger:** Any LP-02 command arrives with the same idempotency key while the first transaction remains uncommitted for longer than two seconds. This can occur during slow writes, database pressure, or an unknown-result retry that overlaps the original attempt.
- **Impact:** All LP-02 write endpoints using this helper return `500 INTERNAL_ERROR` instead of the specified deterministic in-progress conflict. Clients cannot distinguish a normal concurrent retry from an unknown server failure, breaking the LP-01 idempotency semantics that LP2-REQ-021 explicitly requires LP-02 to extend and weakening the safe-retry behavior in LP2-AC-003/012.
- **Evidence:**
  - `packages/db/src/project-execution-service.ts:2980-3120` sets the timeout but rethrows `55P03` without translation.
  - `packages/db/src/service.ts:1574-1578` is the accepted LP-01 behavior and returns `IDEMPOTENCY_IN_PROGRESS` for `55P03`; its integration regression is at `packages/db/test/service.integration.test.ts:412-448`.
  - Reviewer reproduction on exact head held `review-held-lp02-key` in an uncommitted transaction and called `POST /api/v1/projects/:projectId/transitions`; after `2121ms` the response was `500` with `error.code=INTERNAL_ERROR`, not `409 IDEMPOTENCY_IN_PROGRESS`.
  - `docs/feature/lp-02-execution-decisions/requirements.md:108-114,124,135` requires inherited same-key semantics, explicit recovery, and automated concurrency/rollback evidence.
- **Required change:** Reuse one shared command-transaction implementation or add the same explicit `55P03` mapping to the LP-02 helper after rollback, returning the existing `IDEMPOTENCY_IN_PROGRESS` envelope. Add an LP-02 integration regression that holds a same-key row beyond two seconds and asserts the 409 response, then proves same-intent replay/recovery still works after the owner commits or rolls back.
- **Verification:** The focused regression must fail on `478e46b…`, pass on the remediation head for at least one LP-02 route, and the full static, contract, integration, LP-01 acceptance, and LP-02 acceptance gates must remain green.

## 6. Required Actions Before Merge

- [ ] `PRR-001` — Restore the stable `55P03 -> 409 IDEMPOTENCY_IN_PROGRESS` behavior for all LP-02 writes and add a held-key regression.

## 7. Risk Assessment

| Category | Level | Residual risk | Mitigation / owner |
|---|---|---|---|
| Security & privacy | Low | No raw control/capability secret persistence or response leak was found | Preserve cookie scoping, constant-time checks, and Pino redaction |
| Data integrity | Low | Project/fact/audit/idempotency writes are transactionally grouped and injected rollback tests exist | Keep rollback regressions and append-only triggers |
| Reliability & concurrency | High | Same-key contention returns the wrong status/error contract | Resolve `PRR-001` before merge |
| API & compatibility | Medium | Normal paths are typed and green, but contention violates the stable public error protocol | Share the accepted LP-01 transaction helper and contract-test the response |
| Performance & scalability | Low | Public projections use bounded previews/pages; generated OpenAPI is unusually large but current | Measure later under LP-03/UI load |
| Deployment & rollback | Low | No production deployment is authorized in this slice | Preserve migration checksum/readiness and defer production proof to LP-05 |

## 8. Validation Evidence

### Reviewer-executed checks

| Command / check | Environment | Result | Evidence / notes |
|---|---|---|---|
| `npm ci --engine-strict=false` | Node `24.14.0`, npm `11.12.1`; exact head | PASS | 238 locked packages installed; npm differs from requested `11.16.0`, so exact-runtime authority comes from CI |
| `npm run format:check` | exact head | PASS | All matched files use Prettier style |
| `npm run lint` | exact head | PASS | ESLint completed without findings |
| `npm run typecheck` / `npm run build` | exact head | PASS | TypeScript project references and workspace build passed |
| `node --import tsx scripts/check-openapi.ts` | exact head | PASS | LP-01 immutable digest and LP-02 generated artifact are current |
| `npm run test:contract` | exact head | PASS | 6 files, 15 tests |
| `npm run test:unit` | sandboxed local run | PARTIAL | 7 files/22 tests passed; the shutdown child test could not bind localhost under sandbox (`EPERM`) |
| LP-02 migration against isolated review DB | PostgreSQL container; `idea_validation_review_lp02_code1` | PASS | `0002_lp02_execution_decisions: applied` |
| Held same-key LP-02 route reproduction | exact head; isolated PostgreSQL DB; Fastify inject | FAIL | `500 INTERNAL_ERROR` after `2121ms`; expected stable `409 IDEMPOTENCY_IN_PROGRESS` (`PRR-001`) |
| `git diff --check` and full change reconciliation | exact base/head | PASS | No whitespace errors; all 77 changed paths classified |

### CI / platform checks observed

| Check | Observed at | Status | Evidence / notes |
|---|---|---|---|
| `ci / verify` | `2026-07-31T10:05:30Z` | PASS | Exact head `478e46b24c0636b1a476afc5ddbf327275a9ac72`; [run/job](https://github.com/zhanghao1903/idea-trace-validation/actions/runs/30621360037/job/91126437373) |
| GitHub PR state | `2026-07-31T10:05:30Z` | PASS | OPEN, non-draft, `MERGEABLE`, `CLEAN`; requested base/head unchanged |

### Checks not run

- Reviewer-local full integration and LP-01/LP-02 acceptance reruns — local-network escalation was unavailable; exact-head CI covers them and the focused database reproduction was independently executed.
- Production deployment and real-secret observation — outside LP-02 scope and authority.
- Exhaustive dependency source audit — lock integrity and install boundaries were inspected; dependency internals were not exhaustively audited.

## 9. Coverage and Limitations

- **Reviewed:** All 77 changed paths were classified; authored source, migration, tests, workflow, requirements/design/plan, verification, documentation, and project-state changes were inspected.
- **Not reviewed line by line:** Generated OpenAPI and the dependency lockfile; both were checked through their generation/integrity boundaries.
- **Decision limitation:** Local full suite execution was partially constrained, but this does not create the blocking decision: `PRR-001` is an independently reproduced exact-head defect and GitHub CI is green.
- **Staleness condition:** Any change to PR base/head, check state, or report content requires a new exact-snapshot re-review.

## 10. Open Questions and Assumptions

No decision-blocking open questions beyond the required change.

| Assumption | Decision-critical | Status | Evidence |
|---|---|---|---|
| PR #4 still points to the accepted request base/head | true | VERIFIED | Live GitHub refresh reports exact `b562a3c…` / `478e46b…` |
| The green `ci / verify` check belongs to the reviewed head | true | VERIFIED | Check rollup is attached to unchanged head `478e46b…` |
| The reproduction used an isolated non-production database | true | VERIFIED | Dedicated database `idea_validation_review_lp02_code1` on the repository's local test PostgreSQL |
| The held-key result reflects the public API behavior | true | VERIFIED | Fastify inject traversed the actual transition route, service, error handler, and response envelope |

## 11. Non-blocking Recommendations

None. The one actionable issue is merge-blocking.

## 12. Machine-readable Summary

- Result file: `docs/feature/lp-02-execution-decisions/pr-review-idea-trace-validation-4-478e46b24c06-cycle-1.json`
- Schema: `pr-review-result.schema.json` version `1.1`

```yaml
schema_version: "1.1"
review_kind: INITIAL
decision: REQUEST_CHANGES
mergeable: false
head_sha: 478e46b24c0636b1a476afc5ddbf327275a9ac72
blocking_findings:
  - PRR-001
validation_status: FAILED
report_status: CURRENT
```
