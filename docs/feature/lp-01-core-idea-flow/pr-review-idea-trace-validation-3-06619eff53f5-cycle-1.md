# PR Review — `zhanghao1903/idea-trace-validation#3` @ `06619eff53f5`

## 1. Review Metadata

| Field | Value |
|---|---|
| Repository | `zhanghao1903/idea-trace-validation` |
| Pull Request | `#3` — `LP-01: implement core Idea flow` |
| Author | `zhanghao1903` |
| Base | `codex/v0-1-project-plan` @ `30aa27129f21efe6e4ef2bfc17ffa0e1a7282682` |
| Head | `codex/lp-01-core-idea-flow` @ `06619eff53f577a27846b75a299aea580be3a9a3` |
| Reviewed at | `2026-07-30T18:36:15Z` |
| Reviewer | `OpenAI Codex Engineering Review` |
| Report status | `CURRENT` |
| Review mode | `READ_ONLY` |
| Review kind | `INITIAL` |
| Previous review | `N/A — initial review` |
| Previous result integrity | `N/A — initial review` |
| Supersedes | `N/A — initial review` |

## 2. Decision

- **Decision:** `REQUEST_CHANGES`
- **Mergeable:** `false` (GitHub reports the snapshot `MERGEABLE/CLEAN`, but two review findings block approval)
- **Blocking findings:** `2` (`PRR-001`, `PRR-002`)
- **Approval renewal:** `NOT_APPLICABLE`
- **Rationale:** The exact head and CI are current and the implemented main flow passes all existing checks. Approval is withheld because the committed suite does not prove the explicitly required infrastructure-failure rollback invariant, and every successful business route emits an API/audit request ID different from the ID in its request logs.

## 3. Executive Summary

This PR establishes the complete LP-01 Node/PostgreSQL slice: contracts, migration, idempotent and versioned commands, public projections, health gates, documentation, and CI. The reviewer reproduced all existing gates successfully and independently confirmed the exact PR head and green GitHub check. Two bounded but real gaps remain: the atomic-write failure path required by `LP1-REQ-021`/`LP1-AC-008` is not covered by an executable regression, and business responses/audit records cannot be correlated with their request logs because the route layer generates a second ID. Resolve those two findings and re-review the new exact head; the finite shutdown grace defect is recorded separately as non-blocking for this non-production slice.

## 4. Scope and Change Map

### Reviewed scope

- Full `30aa27129f21efe6e4ef2bfc17ffa0e1a7282682..06619eff53f577a27846b75a299aea580be3a9a3` commit and file set.
- Confirmed requirements, approved design and implementation plan, verification record, README, changelog, and project status updates.
- Workspace manifests, exact dependency lock, install-script allowlist, TypeScript/ESLint/Prettier/build/CI configuration.
- TypeBox contracts, error envelopes, OpenAPI generation and drift check, structured-report Schema relocation and contract tests.
- Domain policies, typed IDs, canonical request digest, cursor validation, service ports, audit summaries, and readiness abstraction.
- PostgreSQL migration, constraints, triggers, migration checksum, readiness probe, transaction/idempotency protocol, optimistic concurrency, projections, and concurrency tests.
- Fastify configuration, authentication, normalization, readiness gate, routes, logging/redaction, server startup and shutdown.
- Unit, contract, integration, acceptance, concurrency, authentication, idempotency, and append-only-history tests.

### Excluded or unavailable scope

- `openapi/lp01.v1.json` and `package-lock.json` were source-consistency and dependency-boundary checked, not manually reviewed line by line.
- Production traffic, deployment behavior, and real secrets were unavailable and are outside LP-01 release scope.
- Local reviewer execution used Node.js `26.0.0`/npm `11.12.1`; the requested Node.js `24.18.0`/npm `11.16.0` environment is covered by the exact-head GitHub `ci / verify` success.

### Change map

| Area | Main change | External behavior | Risk | Validation |
|---|---|---|---|---|
| Contracts and API | Adds versioned Idea, clarification, promotion, project, health, and error schemas | Clients receive strict envelopes and generated OpenAPI | Medium | Contract tests, OpenAPI drift check, full route inspection |
| Persistence | Adds PostgreSQL migration, schema constraints, service adapter, audit trigger, and readiness checksum | LP-01 facts and history become durable and queryable | High | Migration and nine integration tests; transaction-failure coverage gap is `PRR-001` |
| Mutation protocol | Adds global idempotency, digest binding, optimistic versioning, deterministic rejection replay, and locks | Retries and concurrent promotions do not duplicate facts | High | Unit/integration/acceptance and concurrency checks pass |
| Access and privacy | Adds bearer write authentication, public reads, bounded inputs, and log redaction | Writes require deployment capability without claiming user identity | High | Contract/acceptance inspection and tests pass |
| Request traceability | Adds server request IDs to logs, responses, idempotency, and audit | Operators should correlate an API result to request evidence | Medium | Executable counterexample fails; see `PRR-002` |
| Runtime lifecycle | Adds health gating and signal-based shutdown | Database readiness is visible and business traffic is gated | Medium | Health tests pass; shutdown deadline remains unenforced in `PRR-003` |
| Documentation and project state | Records LP-01 as ready for formal acceptance without claiming acceptance | Maintainers get reproducible setup and evidence | Low | Diff and link inspection pass |

### Re-review reconciliation

Not applicable — initial review.

- **Full base-to-head diff reconciled:** `true`

## 5. Findings

### PRR-001 — `[S2][Blocking][Testing] Required transaction-failure rollback has no executable regression`

- **Location:** `packages/db/test/service.integration.test.ts:142` (`PostgreSQL command protocol`) @ `06619eff53f577a27846b75a299aea580be3a9a3`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** `LP1-REQ-021` explicitly requires automated transaction-failure coverage, and `LP1-AC-008` requires a simulated failed write to prove that business facts and history are both absent. The nine committed integration tests cover deterministic pre-mutation rejections, append-only enforcement, lock timeout, a separate contender transaction rolling back, replay, and concurrent promotion, but none forces the service's own transaction to fail after a business mutation and before audit/idempotency completion.
- **Trigger:** A future change breaks rollback or moves one of the Idea/audit/idempotency writes outside the application transaction while the existing happy-path, rejection, and concurrency tests continue to pass.
- **Impact:** The repository can report all LP-01 requirements green without executable evidence for its central atomicity failure invariant; a regression could leave a partial Idea, history entry, or terminal idempotency result after an infrastructure error.
- **Evidence:**
  - `docs/feature/lp-01-core-idea-flow/requirements.md:72,86` requires transaction-failure automation and a simulated failure with no partial facts/history.
  - `packages/db/test/service.integration.test.ts:158-287` exercises deterministic validation rejections before business mutation, not an infrastructure failure after mutation begins.
  - `packages/db/test/service.integration.test.ts:327-365` rolls back a separately held idempotency placeholder and then expects the reviewed service call to succeed; it does not fail the service-owned transaction.
  - Reviewer audit of all test files found no injected post-mutation SQL failure or equivalent rollback assertion.
- **Required change:** Add a committed integration regression that deterministically fails a service-owned write after at least one business mutation but before the transaction can finish, then proves that the business fact, audit event, and idempotency terminal result are all absent and that the same key can be retried after recovery.
- **Verification:** The new regression fails if any write escapes the transaction, passes on the corrected exact head, and the full integration/acceptance suite remains green.

### PRR-002 — `[S2][Blocking][Observability] Business responses and audit records use a different request ID from request logs`

- **Location:** `apps/api/src/app.ts:155-167` (`buildApp` route registration) @ `06619eff53f577a27846b75a299aea580be3a9a3`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** Fastify already assigns `request.id` through `genReqId`, and Pino serializes that value. `buildApp` separately injects `() => idFactory.request()` into every business route; handlers call it again for response metadata and write context, so a first business request gets one ID in access logs and a second ID in its response, idempotency row, and audit event.
- **Trigger:** Any successful business read or first-time write, or a domain rejection returned by a business handler.
- **Impact:** A caller or operator cannot use the response/audit `requestId` to find the corresponding incoming/completed request logs. This breaks the intended diagnostic correlation across the entire business API and weakens the traceability claim for successful writes.
- **Evidence:**
  - `apps/api/src/app.ts:34-37` creates the Fastify request ID; `apps/api/src/logger.ts:24-28` logs that ID.
  - `apps/api/src/routes/ideas.ts:27-30,64,75,85` and the clarification, promotion, and project routes invoke the second factory.
  - The design at `docs/feature/lp-01-core-idea-flow/design.md:452,964-966` specifies a server-generated request ID and request-ID-based logging.
  - Reviewer reproduction of `GET /api/v1/ideas` logged `req_01KYT4NB3Q53WJPG30TQ3J3Y32` while the same 200 response returned `req_01KYT4NB3TA2FM10QAJR7V9P3Y`.
- **Required change:** Use the request-scoped Fastify ID as the authoritative first-processing ID for business route responses and command context. Preserve the documented original-ID behavior for terminal idempotent replays, and distinguish any current-attempt log ID explicitly if replay correlation requires both.
- **Verification:** Add route-level tests proving that an initial read/write response ID matches the incoming/completed log ID and that a successful write's audit event carries the same ID; separately prove that replay continues returning the original first-processing ID as designed.

### PRR-003 — `[S2][Non-blocking][Reliability] Shutdown grace expiry does not bound process termination`

- **Location:** `apps/api/src/server.ts:19-28` (`shutdown`) @ `06619eff53f577a27846b75a299aea580be3a9a3`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** The grace timer only sets `process.exitCode = 1`; it neither cancels/forces `app.close()` nor closes remaining resources. When an in-flight request remains attached to a live database/network handle, the awaited `app.close()` can remain pending beyond `SHUTDOWN_GRACE_MS`.
- **Trigger:** `SIGTERM` or `SIGINT` arrives while a handler is blocked longer than the configured grace period.
- **Impact:** A restart or deployment can hang until an external supervisor force-kills the process, contradicting the approved design's finite grace-period behavior. This is non-blocking here because LP-01 explicitly excludes production deployment/release proof, but it should be resolved before relying on this lifecycle in deployment.
- **Evidence:**
  - `apps/api/src/server.ts:21-27` only logs and sets an exit code at the deadline while still awaiting close.
  - `docs/feature/lp-01-core-idea-flow/design.md:1011` requires a finite in-flight grace period followed by pool closure.
- **Required change:** Make the deadline actually settle the shutdown path by aborting/force-closing remaining work and resources after the grace period, with a defined exit outcome.
- **Verification:** A child-process test holds an in-flight request, sends `SIGTERM`, and proves that new traffic stops and the process exits within the configured grace plus a small deterministic scheduling margin.

## 6. Required Actions Before Merge

- [ ] `PRR-001` — Add the post-mutation infrastructure-failure rollback regression required by `LP1-REQ-021`/`LP1-AC-008`.
- [ ] `PRR-002` — Unify first-processing request identity across Fastify logs, API response metadata, command context, and audit history, with replay semantics covered separately.

## 7. Risk Assessment

| Category | Level | Residual risk | Mitigation / owner |
|---|---|---|---|
| Security & privacy | Low | No runtime secret-leak counterexample was found; testing primarily asserts logger configuration rather than production output | Preserve bounded serializers/redaction and add output-level regression when logging expands |
| Data integrity | Medium | Atomic rollback is implemented structurally but lacks the explicitly required post-mutation failure regression | Resolve `PRR-001` before merge |
| Reliability & concurrency | Medium | Idempotency and promotion races pass; shutdown deadline is not enforced | Preserve concurrency tests and schedule `PRR-003` before deployment |
| Performance & scalability | Low | List/detail assembly performs bounded database fan-out up to page limit 100 | Measure and batch if LP-03 load makes this material |
| API & compatibility | Medium | Response schemas pass, but request identity cannot be correlated to logs | Resolve `PRR-002` before merge |
| Deployment & rollback | Low | This slice is not production deployment-ready and graceful shutdown is incomplete | Keep LP-05 boundary explicit; address `PRR-003` before deployment |

## 8. Validation Evidence

### Reviewer-executed checks

| Command / check | Environment | Result | Exit code | Evidence / notes |
|---|---|---|---:|---|
| `npm ci --engine-strict=false` | macOS; Node `26.0.0`, npm `11.12.1`; exact head | PASS | 0 | 238 locked packages installed; local engine override recorded, not used as exact-runtime proof |
| `npm run format:check` | same | PASS | 0 | All matched files use Prettier style |
| `npm run lint` | same | PASS | 0 | ESLint completed without findings |
| `npm run typecheck` | same | PASS | 0 | TypeScript project references passed |
| `npm run build` | same | PASS | 0 | All workspaces built |
| `node --import tsx scripts/check-openapi.ts` | same | PASS | 0 | `openapi/lp01.v1.json is current`; direct loader avoided sandbox-denied tsx IPC |
| `npm run test:unit` | same | PASS | 0 | 4 files, 11 tests |
| `npm run test:contract` | same, after build | PASS | 0 | 3 files, 6 tests |
| `npm run test:integration` | same; PostgreSQL `17.10-alpine` isolated test DB | PASS | 0 | 1 file, 9 tests |
| `npm run test:acceptance` | same database | PASS | 0 | 1 file, 2 tests |
| Request-ID counterexample | built exact head, Fastify inject, captured Pino output | FAIL | 1 | Log ID and response ID differed on one `GET /api/v1/ideas`; `PRR-002` |
| Transaction-failure coverage audit | all repository test files and requirement/plan trace | FAIL | 1 | No service-owned post-mutation failure/rollback regression; `PRR-001` |
| `git diff --check` and full diff reconciliation | exact base/head | PASS | 0 | 99 changed files classified; no whitespace errors |

### CI / platform checks observed

| Check | Observed at | Status | Evidence / notes |
|---|---|---|---|
| `ci / verify` | `2026-07-30T18:36:15Z` | PASS | Exact head `06619eff53f577a27846b75a299aea580be3a9a3`; run `30570020130`, job `90964082839`; Node version from `.nvmrc` |
| GitHub PR state | `2026-07-30T18:36:15Z` | PASS | OPEN, non-draft, `MERGEABLE`, `CLEAN`; exact requested base/head |

### Checks not run

- Production deployment/shutdown observation — LP-05 scope and production environment were not authorized.
- Full dependency source audit — lock integrity, registry origin, exact versions, and install-script allowlist were inspected; dependency internals were not exhaustively audited.

## 9. Coverage and Limitations

- **Reviewed:** All 99 changed paths were classified; all authored source, migration, tests, configuration, workflow, requirements/design/plan, verification, README, changelog, and status changes were inspected. Generated OpenAPI and lockfile were validated through their sources and consistency boundaries.
- **Not reviewed:** Production traffic, production secrets, deployment supervisor behavior, and exhaustive third-party dependency internals.
- **Missing context:** None decision-blocking.
- **Staleness condition:** Any change to PR base/head, check state, review report content, or accepted request authority requires a new exact-snapshot re-review.

## 10. Open Questions and Assumptions

### Open questions

None decision-blocking beyond the required changes.

### Assumptions

| Assumption | Decision-critical | Status | Evidence |
|---|---|---|---|
| PR #3 still points to the requested base/head | true | VERIFIED | GitHub PR refresh and `git ls-remote` both match the request |
| The observed GitHub check belongs to the exact reviewed head | true | VERIFIED | Check rollup is attached to `06619eff53f577a27846b75a299aea580be3a9a3` |
| The local database run used the documented isolated test database | true | VERIFIED | PostgreSQL `17.10-alpine` container on port 54329 and test default `idea_validation_test`; tests truncate only LP-01 test tables |
| Exact Node/npm runtime behavior is represented by CI | false | VERIFIED | Workflow uses `.nvmrc` (`24.18.0`) and exact-head `ci / verify` passed |

## 11. Non-blocking Recommendations

- `PRR-003` — Enforce and regression-test the configured shutdown deadline before LP-05 deployment work relies on it.

## 12. Machine-readable Summary

- Result file: `docs/feature/lp-01-core-idea-flow/pr-review-idea-trace-validation-3-06619eff53f5-cycle-1.json`
- Schema: `pr-review-result.schema.json` version `1.1`

```yaml
schema_version: "1.1"
review_kind: INITIAL
decision: REQUEST_CHANGES
mergeable: false
head_sha: 06619eff53f577a27846b75a299aea580be3a9a3
blocking_findings:
  - PRR-001
  - PRR-002
validation_status: FAILED
report_status: CURRENT
```
