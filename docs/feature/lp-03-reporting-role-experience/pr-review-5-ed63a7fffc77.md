# PR Review — `zhanghao1903/idea-trace-validation#5` @ `ed63a7fffc77`

## 1. Review Metadata

| Field | Value |
|---|---|
| Repository | `zhanghao1903/idea-trace-validation` |
| Pull Request | `#5` — `LP-03: structured reporting and dual-role Web` |
| Author | `zhanghao1903` |
| Base | `codex/v0-1-project-plan` @ `644af4f186b054a9c5d1c6db087a97e009f545a3` |
| Head | `codex/lp-03-reporting-role-experience` @ `ed63a7fffc7700089e800d519bdbc894c9d87860` |
| Reviewed at | `2026-08-01T00:15:57Z` |
| Reviewer | `Codex Engineering Lifecycle Review` |
| Report status | `CURRENT` |
| Review mode | `READ_ONLY` |
| Review kind | `INITIAL` |
| Previous review | `N/A` |
| Previous result integrity | `N/A` |
| Supersedes | `N/A` |

## 2. Decision

- **Decision:** `REQUEST_CHANGES`
- **Mergeable:** `false` under the review gate; GitHub reports the exact snapshot as `MERGEABLE/CLEAN`
- **Blocking findings:** `2` (`PRR-001`, `PRR-002`)
- **Approval renewal:** `NOT_APPLICABLE`
- **Rationale:** The exact head is green in CI and passes the complete reviewer-run verification suite, but the public safe-render response contract accepts unsafe nested token shapes and the delivered rollback evidence explicitly contradicts the approved technical plan. Both are high-confidence contract/compatibility defects that must be reconciled before merge.

## 3. Executive Summary

This PR implements LP-03 report ingestion, immutable revisions, safe-model compilation, experience projections, a dual-role React Web surface, scoped confirmation UI, migrations, documentation and tests. The implementation is generally well structured and its complete verification suite passes at the reviewed head. Approval is withheld for two specific issues: the advertised safe render-model schema is not recursively closed, and the PR replaces an approved old-binary rollback guarantee with a different recovery procedure without a revised approved plan.

## 4. Scope and Change Map

### Reviewed scope

- Exact base-to-head diff, commit chain and all 107 changed paths.
- Structured report schema, validation, Markdown compiler, render-model contract, persistence, revision selection, hydration and API routes.
- PostgreSQL migration, audit/idempotency behavior, experience projections and old LP-01/LP-02 compatibility paths.
- React role views, project detail, seven report blocks, dynamic fallback boundary, confirmation capability flow, static hosting and CSP.
- Unit, contract, integration, component, acceptance and browser tests; OpenAPI/type generation and management/verification documentation.

### Excluded or unavailable scope

- No production deployment or production data was available.
- The generated 148k-line LP-03 OpenAPI artifact was verified by its generator/check and sampled at the affected contract, not manually read line-by-line.

### Change map

| Area | Main change | External behavior | Risk | Validation |
|---|---|---|---|---|
| Report write model | Validates v1 JSON, compiles a render model and atomically stores immutable revisions | Authenticated AI writes gain idempotent report submission | High | Full unit/contract/integration/API suite passed |
| Safe rendering contract | Publishes `ReportCurrentDto` and seven fixed render blocks | Public clients consume a server-supplied render model | High | `PRR-001` executable schema counterexample failed |
| Experience projections | Adds proposer/executor lists and project detail projections | Public role-oriented reads share the same authority rows | Medium | Integration, API, component and browser tests passed |
| Web and confirmation | Adds SPA pages, report fallback and cookie-scoped decisions | Public read UI plus one exact confirmation write path | High | Component/browser and LP-02 acceptance tests passed |
| Migration and recovery | Adds report tables, append-only enforcement and migration `0003` | Upgrade succeeds, but prior LP-02 binary cannot pass readiness afterward | High | Current-head compatibility tests pass; `PRR-002` is admitted by exact-binary inspection |

### Re-review reconciliation

Not applicable — initial review.

#### Forward-risk surfaces

| Surface | Risk triggers | Affected paths | Discriminating checks | Result |
|---|---|---|---|---|
| Public safe render-model DTO and browser renderer | public-contract, trust-boundary, security-privacy | `packages/contracts/src/reports.ts`, `apps/web/src/components/report-renderer.tsx` | Compile the schema and submit an unsafe nested token tree | `FAIL` |
| Additive migration and application rollback | deployment-compatibility, mutation-recovery | `packages/db/migrations/0003_lp03_reporting_experience.sql`, `packages/db/src/readiness.ts`, plan/verification docs | Compare exact LP-02 readiness catalog with post-`0003` ledger and approved rollback claim | `FAIL` |
| Complete current-head behavior | test-adequacy, data-integrity, concurrency | all implementation/test paths | `npm run verify` on exact head with isolated PostgreSQL | `PASS` |

## 5. Findings

### PRR-001 — `[S2][Blocking][api-contract] Safe render-model schema accepts unsafe nested token trees`

- **Location:** `packages/contracts/src/reports.ts:62-105` @ `ed63a7fffc7700089e800d519bdbc894c9d87860`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** `SafeInlineTokenSchema` uses `Type.Unknown()` for recursive `strong`, `emphasis` and `link` children, while Markdown list items are arrays of `Type.Unknown()`. Consequently the public `SafeReportRenderModelSchema` is not the closed discriminated model promised by the design and accepted by the renderer.
- **Trigger:** A legacy/migrated/corrupted render row, or any producer/consumer relying on the advertised response schema, supplies a nested token that bypasses the outer `https://` and token-discriminant checks. The Web recursively consumes those children and uses a nested link's `href` directly.
- **Impact:** The machine-readable response contract accepts values outside the safe compiler model, so response validation/OpenAPI cannot enforce the security boundary and malformed persisted data can reach renderer paths that assume a closed safe tree. This defeats the defense-in-depth and compatibility guarantees for stored render models.
- **Evidence:**
  - `Schema.Compile(SafeReportRenderModelSchema).Check(...)` returned `true` for `strong.children -> link(href="javascript:alert(1)") -> html` at the exact head.
  - `apps/web/src/components/report-renderer.tsx` recursively renders `token.children` and applies `token.href` without a second validator.
  - Existing contract coverage checks only an unknown top-level block discriminant and does not exercise recursive token/list closure.
- **Required change:** Define recursive, closed TypeBox schemas for every inline token and Markdown list item (and keep the generated OpenAPI aligned), so every nested link reuses the HTTPS constraint and every nested node uses an allowed discriminant. Add a regression proving the counterexample and other unknown nested shapes are rejected.
- **Verification:** The exact counterexample returns `false`; valid deeply nested safe Markdown remains accepted; report contract, OpenAPI, Web component and full verification suites pass.

### PRR-002 — `[S2][Blocking][compatibility] Delivered rollback procedure contradicts the approved plan`

- **Location:** `docs/feature/lp-03-reporting-role-experience/verification.md:87-90` @ `ed63a7fffc7700089e800d519bdbc894c9d87860`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** The approved implementation plan states that the prior LP-02 binary can run after application rollback against the additive LP-03 schema. The delivered verification record instead confirms that exact binary rejects the additional `0003` migration row and changes recovery to an LP-03 forward-fix or pre-`0003` backup restore.
- **Trigger:** Apply migration `0003`, then roll the application binary back to the authoritative LP-02 build while leaving the forward-only schema in place, exactly as the approved rollback section describes.
- **Impact:** The prior binary reports `MIGRATION_MISMATCH`, business routes remain behind the readiness gate, and the documented old-API rollback path is unavailable. Operators would discover that the approved recovery guarantee is false during an incident.
- **Evidence:**
  - `implementation-plan.md:477-478` promises that the LP-02 binary runs against the LP-03 schema.
  - `verification.md:87-90` explicitly states the exact binary rejects any migration outside its two-row catalog.
  - At authoritative base `644af4f...`, `packages/db/src/readiness.ts:66-74` returns `MIGRATION_MISMATCH` whenever the ledger row count differs from the exact expected catalog.
- **Required change:** Reconcile implementation and approved authority before code approval: either make the approved old-binary/additive-schema rollback executable and cover it, or route and pass a revised technical plan that explicitly authorizes and tests the different forward-fix/backup recovery model. Do not claim conformance to both incompatible procedures.
- **Verification:** After `0003`, an executable recovery drill proves the approved rollback behavior and old LP-01/LP-02 API readiness, or a newly approved exact plan and matching recovery test replace that guarantee without contradictory documentation.

## 6. Required Actions Before Merge

- [ ] `PRR-001` — Close the recursive public render-model schema and add negative contract coverage.
- [ ] `PRR-002` — Make rollback behavior conform to approved authority or obtain a revised approved plan with executable recovery evidence.

## 7. Risk Assessment

| Category | Level | Residual risk | Mitigation / owner |
|---|---|---|---|
| Security & privacy | High | Public safe-render DTO does not validate nested token shapes | Resolve `PRR-001`; Main |
| Data integrity | Low | Revision/idempotency/audit transaction paths passed integration and rollback failpoint tests | Preserve current transactional tests; Main |
| Reliability & concurrency | Low | Full integration/acceptance suite passed; broad LP-02 `55P03` classification remains out of scope | Existing tests and optional later follow-up; Main |
| Performance & scalability | Low | Batch projection/hydration avoids obvious N+1 paths; no production load test | Monitor at deployment; owner |
| API & compatibility | High | Advertised response contract is broader than runtime/compiler invariants | Resolve `PRR-001`; Main |
| Deployment & rollback | High | Prior LP-02 binary is not ready after migration `0003` despite approved claim | Resolve `PRR-002`; Main/plan owner |

## 8. Validation Evidence

### Reviewer-executed checks

| Command / check | Environment | Result | Exit code | Evidence / notes |
|---|---|---|---:|---|
| `npm ci` | macOS, Node `24.14.0`, npm `11.16.0`, exact head | `PASS` | 0 | 364 locked packages installed |
| `npm run db:migrate:test` | documented isolated PostgreSQL 17 test DB, exact head | `PASS` | 0 | Migration `0003` already applied |
| `npm run verify` | macOS, Node `24.14.0`, npm `11.16.0`, isolated PostgreSQL, Playwright Chromium | `PASS` | 0 | format/lint/types/build/OpenAPI; 37 unit, 20 contract, 31 integration, 8 component, 10 acceptance and 7 browser tests passed |
| `git diff --check 644af4f...ed63a7f` | exact base/head | `PASS` | 0 | No whitespace errors |
| Compile `SafeReportRenderModelSchema` and check unsafe nested token | Node `24.14.0`, exact head | `FAIL` | 0 (assertion observation) | Schema returned `{\"accepted\":true}` for nested `javascript:` link and unknown `html` token; proves `PRR-001` |
| Compare exact LP-02 readiness catalog to post-`0003` ledger | exact base code plus current migration/verification | `FAIL` | N/A | Row-count mismatch deterministically returns `MIGRATION_MISMATCH`; proves `PRR-002` |

### CI / platform checks observed

| Check | Observed at | Status | Evidence / notes |
|---|---|---|---|
| `ci / verify` | `2026-08-01T00:15:57Z` | `PASS` | Exact head `ed63a7fffc7700089e800d519bdbc894c9d87860`; completed `2026-07-31T18:26:53Z`; [run 30655018969](https://github.com/zhanghao1903/idea-trace-validation/actions/runs/30655018969/job/91237177045) |
| PR snapshot | `2026-08-01T00:15:57Z` | `PASS` | Open, non-draft, exact base/head, `MERGEABLE`, `CLEAN` |

### Checks not run

- Production deployment/load testing — no production environment or data was in scope.
- A live prior-LP-02-binary rollback drill — the exact old readiness code and this PR's own verification record already deterministically falsify the approved claim; remediation must add the missing executable recovery proof.

## 9. Coverage and Limitations

- **Reviewed:** Complete exact base-to-head change map; report/experience/API/Web/security/migration paths; all automated test families; management and recovery evidence.
- **Not reviewed:** Production traffic, production secrets, real-user usability study and manual line-by-line inspection of the generated OpenAPI payload.
- **Missing context:** None decision-critical.
- **Staleness condition:** Any change to PR base/head, checks, report artifacts, accepted plan authority or live PR state requires a new routed review cycle.

## 10. Open Questions and Assumptions

### Open questions

None; both required outcomes can be verified without an unresolved product choice.

### Assumptions

| Assumption | Decision-critical | Status | Evidence |
|---|---|---|---|
| The requested SHA is the exact GitHub PR head | true | `VERIFIED` | Live PR refresh at `2026-08-01T00:15:57Z` |
| Stored render models may be read across compiler/protocol evolution and therefore must be validated by the advertised closed DTO | true | `VERIFIED` | Accepted design specifies persisted immutable render models and compatibility fallback |
| The authoritative LP-02 binary uses the two-row exact migration catalog at base `644af4f...` | true | `VERIFIED` | Exact base `readiness.ts:60-74` and PR verification record |

## 11. Non-blocking Recommendations

None.

## 12. Machine-readable Summary

- Result file: `docs/feature/lp-03-reporting-role-experience/pr-review-5-ed63a7fffc77.json`
- Schema: `pr-review-result.schema.json` version `1.1`

```yaml
schema_version: "1.1"
review_kind: INITIAL
decision: REQUEST_CHANGES
mergeable: false
head_sha: ed63a7fffc7700089e800d519bdbc894c9d87860
blocking_findings:
  - PRR-001
  - PRR-002
validation_status: FAILED
report_status: CURRENT
```
