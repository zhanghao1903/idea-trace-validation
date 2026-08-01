# PR Re-review — `zhanghao1903/idea-trace-validation#5` @ `0ecdc5c51860`

## 1. Review Metadata

| Field | Value |
|---|---|
| Repository | `zhanghao1903/idea-trace-validation` |
| Pull Request | `#5` — `LP-03: structured reporting and dual-role Web` |
| Author | `zhanghao1903` |
| Base | `codex/v0-1-project-plan` @ `644af4f186b054a9c5d1c6db087a97e009f545a3` |
| Head | `codex/lp-03-reporting-role-experience` @ `0ecdc5c51860d5f32cae2431bda481eaa80fa7ed` |
| Reviewed at | `2026-08-01T07:31:22Z` |
| Reviewer | `Codex Engineering Lifecycle Review` |
| Report status | `CURRENT` |
| Review mode | `READ_ONLY` |
| Review kind | `RE_REVIEW` |
| Previous review | `REQUEST_CHANGES` @ `ed63a7fffc7700089e800d519bdbc894c9d87860` |
| Previous result integrity | JSON SHA-256 `5e792fb23d5c1179b613f1b9299b30e1b4833958420becbbb90bdb60454f6e99` verified from immutable commit `053cf444cc8e80d6e8947d6cf73bc6361b66673b` |
| Supersedes | `docs/feature/lp-03-reporting-role-experience/pr-review-5-ed63a7fffc77.json` |

## 2. Decision

- **Decision:** `REQUEST_CHANGES`
- **Mergeable:** `false` under the review gate; GitHub currently reports the exact snapshot as open, non-draft and mergeable.
- **Blocking findings:** `1` (`PRR-001`)
- **Approval renewal:** `WITHHELD`
- **Rationale:** The remediation fixes the prior migration/rollback blocker and the exact head is green, but its revised public response schema rejects the Markdown list shape produced by the production compiler. Valid persisted reports containing ordinary lists can therefore fail current/revision response serialization with HTTP 500.

## 3. Re-review Summary

Cycle 2 changes one commit and twelve files. Every delta file was classified and reviewed, both prior findings were revalidated, the complete base-to-head implementation was reconciled with the initial review, and a fresh-context independent pass reproduced the remaining blocker. This rejection is based on one executable current-head contract/runtime failure, not on file count, style or hypothetical future work.

## 4. Delta Reconciliation

### Remediation delta

- Range: `ed63a7fffc7700089e800d519bdbc894c9d87860..0ecdc5c51860d5f32cae2431bda481eaa80fa7ed`
- Commit: `0ecdc5c51860d5f32cae2431bda481eaa80fa7ed` (`fix(lp03): close review contract gaps`)
- Size: 431 insertions, 441 deletions across 12 files.
- Reviewed files: `CHANGELOG.md`, `apps/api/src/app.ts`, `docs/feature/lp-03-reporting-role-experience/verification.md`, `docs/migration-notes.md`, `openapi/lp03.v1.json`, `packages/contracts/src/reports.ts`, `packages/contracts/test/lp03-api.contract.test.ts`, `packages/db/src/migrate.ts`, `packages/db/src/migrations.ts`, `packages/db/src/readiness.ts`, `packages/db/src/schema/index.ts`, `packages/db/test/service.integration.test.ts`.
- Excluded/unclassified files: none.
- Full PR diff reconciled: yes.

### Prior finding revalidation

| Finding | Previous | Current | Evidence |
|---|---|---|---|
| `PRR-001` | open | open | Recursive inline tokens are now closed and unsafe nested tokens are rejected, but list items are declared as `SafeInlineToken[][]` while the production compiler emits `SafeMarkdownBlock[][]`; a real compiled list fails the registered response serializer with HTTP 500. |
| `PRR-002` | open | resolved | Migration `0003` moved to a separate feature ledger, prior ledger rows remain exact, current readiness checks both ledgers, and the exact LP-02 binary plus its LP-01/LP-02 acceptance suites run successfully against the upgraded database. |

### Forward-risk review

| Surface | Discriminating check | Result |
|---|---|---|
| Recursive public report DTO/compiler/serializer | Compile ordinary Markdown list, check it against `SafeReportRenderModelSchema`, then serve it through the registered Fastify response serializer | `FAIL` — schema check is false and the API returns `500 INTERNAL_ERROR` |
| Dual-ledger migration and application rollback | Migrate a prior layout, run exact LP-02 readiness and LP-01/LP-02 acceptance against the upgraded database | `PASS` |
| Complete current-head regression | Run `npm run verify` with the required toolchain and isolated PostgreSQL | `PASS` |

### Approval renewal

- Old approval/decision invalidated by head change: yes.
- Previous findings revalidated: yes.
- Forward-risk review completed: yes.
- All delta changes classified: yes.
- Current-head validation complete: yes.
- Independent pass: `FAIL`; it independently reproduced the same list contract/HTTP 500 path and found no separate migration blocker.
- Result: `WITHHELD`.

## 5. Findings

### PRR-001 — `[S2][Blocking][api-contract] Recursive remediation rejects compiler-produced Markdown lists`

- **Location:** `packages/contracts/src/reports.ts:107-123` @ `0ecdc5c51860d5f32cae2431bda481eaa80fa7ed`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** `SafeMarkdownBlockSchema` declares each list item as an array of `SafeInlineToken`, but `compileSafeMarkdown` and the canonical TypeScript model define each item as an array of `SafeMarkdownBlock`. Ordinary list items therefore contain paragraph blocks and may contain nested lists, neither of which satisfies the response schema.
- **Trigger:** Submit a valid report whose Markdown text contains an ordinary list such as `- one\n- two`, then read the current or revision report response.
- **Impact:** The report can be accepted and persisted, but response serialization rejects its compiler-produced render model and the endpoint returns HTTP 500. Generated OpenAPI advertises the same incorrect wire shape.
- **Evidence:**
  - `packages/reporting/src/markdown.ts:117-130` emits `items: SafeMarkdownBlock[][]`, matching `packages/reporting/src/types.ts:36-42`.
  - On the exact head, the real compiler output for `- one\n- two` returns `false` from the registered render-model schema check.
  - Serving that compiler-produced model through the actual Fastify app returns `500 INTERNAL_ERROR` with serializer mismatch.
  - The new contract fixture at `packages/contracts/test/lp03-api.contract.test.ts:123-126` fabricates inline tokens in list items, a shape the production compiler does not emit, so all 21 contract tests pass while missing the defect.
- **Required change:** Define a recursive `SafeMarkdownBlock` schema and use block references for list items, preserving the closed recursive inline-token schema. Regenerate OpenAPI and test the real compiler output through schema validation and response serialization, including nested lists.
- **Verification:** Compiler-produced ordinary and nested lists pass the registered response schema and current/revision endpoints return 200; unsafe nested tokens remain rejected; contract, OpenAPI and full verification suites pass.

### PRR-002 — `[S2][Resolved][compatibility] Old-binary rollback now works through a separate feature migration ledger`

- **Location:** `packages/db/src/migrate.ts:1` @ `0ecdc5c51860d5f32cae2431bda481eaa80fa7ed`
- **Confidence:** `High`
- **Status:** `resolved`
- **Observation:** The remediation keeps the legacy `schema_migrations` ledger exact for LP-02, tracks `0003` in `schema_feature_migrations`, migrates a prior Cycle 1 ledger layout without replaying SQL, and makes current readiness validate both catalogs strictly.
- **Evidence:**
  - Targeted current-head migration/readiness integration passed 10/10.
  - The exact LP-02 `PostgresReadiness` implementation returned `READY` against the upgraded Cycle 2 database.
  - Exact LP-01 and LP-02 acceptance suites passed 2/2 each against that database.
- **Required change:** Completed; preserve the dual-ledger and old-binary compatibility tests.

## 6. Required Actions Before Merge

- [ ] `PRR-001` — Align the recursive Markdown block response schema with real compiler output and add compiler-to-serializer regressions.
- [x] `PRR-002` — Preserve exact LP-02 rollback compatibility through the feature migration ledger.

## 7. Validation Evidence

| Check | Result | Evidence / notes |
|---|---|---|
| `npm ci` with Node `24.14.0`, npm `11.16.0` | `PASS` | 364 locked packages installed |
| `npm run verify` on exact head | `PASS` | format, lint, report types, typecheck, build, OpenAPI; 37 unit, 21 contract, 31 integration, 8 component, 10 acceptance and 7 browser tests |
| Targeted migration/readiness integration | `PASS` | 10/10 |
| Exact LP-02 readiness against upgraded DB | `PASS` | Returned `READY` |
| Exact LP-01 and LP-02 acceptance against upgraded DB | `PASS` | 2/2 and 2/2 |
| Real compiler list -> registered schema/serializer | `FAIL` | Contract false; Fastify response `500 INTERNAL_ERROR` |
| Fresh-context independent review | `FAIL` | Independently reproduced the same public contract/serializer defect |
| `git diff --check` | `PASS` | No whitespace errors |
| GitHub `ci / verify` | `PASS` | Exact head; [run 30676378147](https://github.com/zhanghao1903/idea-trace-validation/actions/runs/30676378147/job/91304391462) |

## 8. Coverage and Limitations

- No production deployment, production data or load test was available.
- The generated OpenAPI artifact was generator-verified and inspected at the affected list schema, not manually read line-by-line.
- Any base/head/check change invalidates this result and requires a new routed cycle.

## 9. Machine-readable Summary

- Result file: `docs/feature/lp-03-reporting-role-experience/pr-review-5-0ecdc5c51860.json`
- Schema: `pr-review-result.schema.json` version `1.1`

```yaml
schema_version: "1.1"
review_kind: RE_REVIEW
decision: REQUEST_CHANGES
mergeable: false
head_sha: 0ecdc5c51860d5f32cae2431bda481eaa80fa7ed
blocking_findings:
  - PRR-001
validation_status: FAILED
report_status: CURRENT
```
