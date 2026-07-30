# PR Review — `zhanghao1903/idea-trace-validation#3` @ `f2acdd8996c2`

## 1. Review Metadata

| Field | Value |
|---|---|
| Repository | `zhanghao1903/idea-trace-validation` |
| Pull Request | `#3` — `LP-01: implement core Idea flow` |
| Author | `zhanghao1903` |
| Base | `codex/v0-1-project-plan` @ `30aa27129f21efe6e4ef2bfc17ffa0e1a7282682` |
| Head | `codex/lp-01-core-idea-flow` @ `f2acdd8996c2465f004308b0058f8b7f2406165d` |
| Reviewed at | `2026-07-30T19:19:41Z` |
| Reviewer | `OpenAI Codex Engineering Review` |
| Report status | `CURRENT` |
| Review mode | `READ_ONLY` |
| Review kind | `RE_REVIEW` |
| Previous review | cycle 1 report @ `3464c1b309817621d5b42dc751743779fa772b81`; base `30aa2712`, head `06619eff`; `REQUEST_CHANGES` |
| Previous result integrity | `docs/feature/lp-01-core-idea-flow/pr-review-idea-trace-validation-3-06619eff53f5-cycle-1.json`, SHA-256 `45851320d0d24940c6860094c312fa6b1a957ef0d3b8218807336e968bcd3a71` |
| Supersedes | `codex/review-records/lp-01-core-idea-flow-7a4c1e9d2b60/code-1-06619eff53f5` |

## 2. Decision

- **Decision:** `REQUEST_CHANGES`
- **Mergeable:** `false`
- **Blocking findings:** `1` (`PRR-001`)
- **Approval renewal:** `FAIL`
- **Rationale:** The exact head and CI are green, and PRR-002 and PRR-003 are resolved. PRR-001 remains open because the new rollback regression creates no clarification question and fails before an audit row is inserted, so its zero-row assertions cannot prove rollback of the question and audit mutations claimed by LP1-AC-008 and the verification record.

## 3. Executive Summary

The remediation unifies the Fastify request identity and enforces a finite shutdown deadline with current-head regressions. It also adds a useful transaction-failure test that proves rollback of the idempotency record, Idea, and hypothesis statement and proves same-key recovery. That test is not yet discriminating for clarification-question or audit rollback, while the verification document claims both; approval renewal is therefore withheld on the preserved PRR-001 only.

## 4. Scope and Change Map

### Reviewed scope

- Previous report integrity, all three prior findings, and the immutable previous review snapshot.
- The complete `06619eff..f2acdd8` remediation delta: one commit and all 14 changed paths.
- The current base-to-head persistence, request-identity, shutdown, documentation, and test call paths affected by the remediation.
- Current-head format, lint, typecheck, build, OpenAPI, unit, contract, integration, acceptance, and GitHub CI evidence.

### Excluded or unavailable scope

- Generated OpenAPI and package-lock content were source-consistency checked rather than manually reviewed line by line.
- Production traffic, deployment-supervisor behavior, real secrets, and exhaustive dependency internals were unavailable.

### Change map

| Area | Main change | External behavior | Risk | Validation |
|---|---|---|---|---|
| Transaction rollback evidence | Adds a targeted audit-insert failure and same-key retry regression. | Idea, statement, and idempotency rollback are demonstrated, but question and audit rollback are not. | High | Integration test passes; discriminating-evidence audit fails PRR-001. |
| Request traceability | Removes the second ID factory and uses Fastify `request.id` across handlers and first-processing writes. | Logs, initial responses, and audit correlate; terminal replay retains the original first-processing ID. | Low | Contract, acceptance, and reviewer counterexample regression pass. |
| Runtime lifecycle | Adds deadline-raced shutdown, force-closing, and held-request child-process coverage. | New traffic stops and the process exits by the configured deadline. | Low | Unit regression and full verify pass. |
| Documentation | Updates verification and changelog for cycle-1 remediation. | Maintainers receive a remediation claim stronger than the committed rollback test proves. | Medium | Documentation-to-test reconciliation fails PRR-001. |

### Re-review reconciliation

| Previous report | Previous base/head | Previous decision | Current base/head | Delta | Old decision state |
|---|---|---|---|---|---|
| cycle 1 @ `3464c1b30981` | `30aa2712` / `06619eff` | `REQUEST_CHANGES` | `30aa2712` / `f2acdd8` | `06619eff..f2acdd8` | `SUPERSEDED` |

- **Delta commits reviewed:** `f2acdd8996c2465f004308b0058f8b7f2406165d`
- **Delta files reviewed:** `CHANGELOG.md`; `apps/api/src/app.ts`; `apps/api/src/routes/{clarifications,ideas,projects,promotions}.ts`; `apps/api/src/server.ts`; `apps/api/src/shutdown.ts`; `apps/api/test/fixtures/shutdown-child.ts`; `apps/api/test/lp01.acceptance.test.ts`; `apps/api/test/request-id.contract.test.ts`; `apps/api/test/shutdown.unit.test.ts`; `docs/feature/lp-01-core-idea-flow/verification.md`; `packages/db/test/service.integration.test.ts`
- **Unclassified changes:** none
- **Full base-to-head diff reconciled:** `true`

#### Finding closure ledger

| Finding | Previous status | Current status | Current-head evidence | Negative regression |
|---|---|---|---|---|
| `PRR-001` | open | open | The failure trigger runs before audit insert, and `createBody.clarificationQuestions` is empty. | The regression passes but cannot fail for escaped question/audit writes. |
| `PRR-002` | open | resolved | Business routes use `request.id`; replay intentionally returns `first_request_id`. | Contract/acceptance coverage and the original log/response counterexample now pass with one ID. |
| `PRR-003` | open | resolved | `shutdownApplication` races close work against a deadline and force-closes on expiry. | Held-request/non-settling-hook child exits with code 1 within the deadline margin. |

#### Forward-risk surfaces

| Surface | Risk triggers | Affected paths | Discriminating checks | Result |
|---|---|---|---|---|
| Transaction rollback and recovery evidence | data-integrity, mutation-recovery, test-adequacy | `packages/db/test/service.integration.test.ts`, `docs/.../verification.md` | Inspect the fixture's created rows and failure point against every asserted rollback row type. | `FAIL` |
| Request identity and idempotent replay | public-contract, observability | API app/routes and request-ID tests | Compare incoming/completed log ID, initial response/audit ID, and replay semantics. | `PASS` |
| Deadline-bounded shutdown | deployment-compatibility, reliability | server/shutdown and child-process tests | Hold a request and close hook, signal the child, and observe listener stop plus bounded exit. | `PASS` |
| Existing API, auth, OpenAPI, and persistence behavior | public-contract, trust-boundary, regression | complete base-to-head affected paths | Run full verify and exact-head CI. | `PASS` |

#### Approval-renewal gate

- [x] Old decision invalidated
- [x] Previous findings revalidated at current head
- [x] Forward-risk review completed
- [x] All delta changes classified and full PR diff reconciled
- [x] Decision-critical assumptions verified
- [x] Current-head validation and CI complete
- [ ] No open blocker or decision-blocking limitation
- **Independent pass:** `PASS` — a fresh-context reviewer independently reconciled all 14 delta files, confirmed PRR-002/003 closure, and identified the non-discriminating PRR-001 assertions.

## 5. Findings

### PRR-001 — `[S2][Blocking][testing] Rollback regression does not prove every claimed mutation rolls back`

- **Location:** `packages/db/test/service.integration.test.ts:32-42,158-216` @ `f2acdd8996c2465f004308b0058f8b7f2406165d`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** The new fixture uses `clarificationQuestions: []`, so the asserted zero question count is true without rollback. Its trigger raises in `BEFORE INSERT ON audit_events`, so no audit row can exist even if audit rollback were broken. The test therefore proves rollback for earlier Idea, statement, and idempotency writes, but not for question or successful audit mutations; `verification.md:18` nevertheless claims all five categories were demonstrated.
- **Trigger:** A future change moves clarification-question or audit persistence outside the service-owned transaction while the current regression continues to fail before audit insertion and creates no question.
- **Impact:** LP1-REQ-021/LP1-AC-008 and the verification record can report complete atomicity while regressions in two specifically claimed write categories remain undetected.
- **Evidence:**
  - `packages/db/test/service.integration.test.ts:32-42` defines an empty clarification-question list.
  - `packages/db/test/service.integration.test.ts:161-177` raises before the target audit insert.
  - `packages/db/test/service.integration.test.ts:194-216` asserts zero questions and audit rows without first creating either row.
  - `docs/feature/lp-01-core-idea-flow/verification.md:18` claims Idea, statements, questions, audit, and idempotency state all roll back.
- **Required change:** Make the regression create at least one clarification question and inject the infrastructure failure after a successful audit insert but before commit, such as on the terminal idempotency-status update. Then assert every created business, question, audit, and idempotency row is absent and the same key succeeds after recovery.
- **Verification:** The regression must fail if either question or audit writes escape the transaction, pass at the remediation head, and the full integration and acceptance suites must remain green.

### PRR-002 — `[S2][Resolved][observability] One request identity now spans first-processing logs, responses, and audit`

- **Location:** `apps/api/src/app.ts` and business route modules @ `f2acdd8996c2465f004308b0058f8b7f2406165d`
- **Confidence:** `High`
- **Status:** `resolved`
- **Observation:** Business routes now use the Fastify request-scoped ID, while terminal idempotent replay returns the documented original first-processing ID.
- **Trigger:** Initial business reads/writes and a later terminal replay.
- **Impact:** Operators can correlate initial response/audit IDs with request logs without breaking replay identity semantics.
- **Evidence:** Current contract and acceptance tests inspect the on-request ID, response ID, audit ID, and distinct replay-attempt/original IDs.
- **Required change:** Completed at the current head.
- **Verification:** Request-ID contract and acceptance tests pass; the reviewer log/response proof produces one initial ID.

### PRR-003 — `[S2][Resolved][reliability] Shutdown grace now bounds process termination`

- **Location:** `apps/api/src/shutdown.ts` @ `f2acdd8996c2465f004308b0058f8b7f2406165d`
- **Confidence:** `High`
- **Status:** `resolved`
- **Observation:** Shutdown races application/pool closure against a real deadline and force-closes remaining work with a defined failure exit.
- **Trigger:** A signal arrives while a request and close hook remain unsettled.
- **Impact:** Restart and deployment no longer depend solely on an external supervisor to terminate the process after grace expiry.
- **Evidence:** The child-process test holds both paths, sends `SIGTERM`, confirms traffic stops, and observes bounded exit code 1.
- **Required change:** Completed at the current head.
- **Verification:** Shutdown unit tests and the complete verify run pass.

## 6. Required Actions Before Merge

- [ ] `PRR-001` — Make the post-mutation rollback regression discriminating for clarification-question and successful audit writes, and align the verification claim with demonstrated evidence.
- [x] `PRR-002` — Unify first-processing request identity while preserving terminal replay identity.
- [x] `PRR-003` — Enforce a finite shutdown deadline and cover it with a held-request child process.

## 7. Risk Assessment

| Category | Level | Residual risk | Mitigation / owner |
|---|---|---|---|
| Security & privacy | Low | No new secret or authorization issue was found. | Preserve bounded serializers, redaction, and bearer-write tests / API owner. |
| Data integrity | Medium | Question and audit rollback are structurally inside the transaction but not discriminatingly proven by the new regression. | Resolve PRR-001 before merge / persistence owner. |
| Reliability & concurrency | Low | Deadline enforcement and existing concurrency paths pass; forced exit can still lose buffered final logs. | Preserve child-process and concurrency coverage / runtime owner. |
| Performance & scalability | Low | Existing bounded list/detail fan-out remains unchanged by this delta. | Measure and batch if later load makes it material / future LP-03 owner. |
| API & compatibility | Low | Request identity is repaired and strict API/OpenAPI checks pass. | Preserve initial and replay identity coverage / API owner. |
| Deployment & rollback | Low | Production supervisor behavior remains outside LP-01, but process deadline behavior is now executable. | Revalidate under LP-05 deployment conditions / deployment owner. |

## 8. Validation Evidence

### Reviewer-executed checks

| Command / check | Environment | Result | Exit code | Evidence / notes |
|---|---|---|---:|---|
| `npm ci --engine-strict=false` | macOS; Node 26.0.0; npm 11.12.1; exact head | PASS | 0 | 238 locked packages installed; engine variance recorded below. |
| `npm run verify` | macOS; Node 26.0.0; npm 11.12.1; PostgreSQL 17.10 isolated test DB; exact head | PASS | 0 | Format, lint, typecheck, build, OpenAPI, unit 13, contract 7, integration 10, acceptance 2 all pass. |
| request-ID correlation proof | built exact head; in-memory service/readiness doubles | PASS | 0 | Incoming/completed Pino and response all used `req_01KYT73FMDR8BM6QRP74GRBXYD`. |
| PRR-001 discriminating-evidence audit | exact current source, requirements, and verification | FAIL | 1 | No question is created; failure occurs before audit insert, so those zero counts do not demonstrate rollback. |
| `git diff --check` and delta classification | exact local Git objects | PASS | 0 | No whitespace errors; all 14 delta paths classified; full PR reconciled. |

### CI / platform checks observed

| Check | Observed at | Status | Evidence / notes |
|---|---|---|---|
| `ci / verify` | `2026-07-30T19:19:41Z` | PASS | Exact head `f2acdd8`; run `30573279485`, job `90975154429`. |

### Checks not run

- Production deployment and supervisor observation — LP-05 scope and production environment were not authorized.
- Exhaustive third-party dependency source audit — lock integrity and affected dependency boundary were checked; dependency internals were outside review scope.

## 9. Coverage and Limitations

- **Reviewed:** the immutable previous result, all 14 remediation paths, all prior finding paths, and current base-to-head forward-risk surfaces.
- **Not reviewed:** production traffic, external supervisor behavior, real secrets, and exhaustive dependency internals.
- **Missing context:** none that prevents the decision.
- **Staleness condition:** any base/head change, check regression, or change to the accepted request requires a new review cycle.

## 10. Open Questions and Assumptions

### Open questions

None.

### Assumptions

| Assumption | Decision-critical | Status | Evidence |
|---|---|---|---|
| PR #3 still points to the accepted exact base/head. | true | VERIFIED | Live PR metadata reports base `30aa2712` and head `f2acdd8`. |
| The green check belongs to the exact reviewed head. | true | VERIFIED | `ci / verify` is complete and successful for `f2acdd8`. |
| Reviewer database runs used the isolated test database. | true | VERIFIED | Test configuration targets `idea_validation_test` and truncates only LP-01 test tables. |
| Exact Node 24.18/npm 11.16 behavior is represented by CI. | false | VERIFIED | The exact-head workflow uses `.nvmrc` and passed. |

## 11. Non-blocking Recommendations

- `NOTE-001` — Exercise the production `server.ts` signal wiring directly in a later deployment-level regression; the current child fixture duplicates the wiring around the production shutdown helper.

## 12. Machine-readable Summary

- Result file: `pr-review-idea-trace-validation-3-f2acdd8996c2-cycle-2.json`
- Schema: `schemas/pr-review-result.schema.json`

```yaml
schema_version: "1.1"
review_kind: RE_REVIEW
decision: REQUEST_CHANGES
mergeable: false
head_sha: f2acdd8996c2465f004308b0058f8b7f2406165d
blocking_findings:
  - PRR-001
validation_status: FAILED
report_status: CURRENT
```
