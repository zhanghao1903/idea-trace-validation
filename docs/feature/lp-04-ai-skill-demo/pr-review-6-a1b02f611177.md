# PR Review — `zhanghao1903/idea-trace-validation#6` @ `a1b02f611177`

## 1. Review Metadata

| Field | Value |
|---|---|
| Repository | `zhanghao1903/idea-trace-validation` |
| Pull Request | `#6` — `LP-04: AI Skill and repeatable demo` |
| Author | `zhanghao1903` |
| Base | `codex/v0-1-project-plan` @ `818671c504c8b8b8cd41f8ebc096f341ece6b18f` |
| Head | `codex/lp-04-ai-skill-demo` @ `a1b02f6111777b104d794d7da0e11dd17a26a1c4` |
| Reviewed at | `2026-08-02T01:02:14Z` |
| Reviewer | `Codex Engineering Lifecycle Review` |
| Report status | `CURRENT` |
| Review mode | `READ_ONLY` |
| Review kind | `INITIAL` |
| Previous review | N/A |
| Previous result integrity | N/A |
| Supersedes | N/A |

## 2. Decision

- **Decision:** `REQUEST_CHANGES`
- **Mergeable:** `false` for review purposes; GitHub reports the exact snapshot mechanically mergeable but still `draft`.
- **Blocking findings:** `3` (`PRR-001`, `PRR-002`, `PRR-003`)
- **Approval renewal:** `NOT_APPLICABLE`
- **Merge disposition:** `NOT_REQUESTED`; review-only policy and blocking findings prohibit merge authority.
- **Rationale:** Three exact-head defects let LP-04 claim client or resource success without authoritative proof and turn a documented retryable idempotency state into terminal rejection. Green CI does not cover these counterexamples, and draft state would independently block merge readiness.

## 3. Executive Summary

PR #6 adds the repository Skill, deterministic real-HTTP demo, durable recovery journal, client evidence, synthetic human facilitator and real-data browser story required by LP-04. The credential/human boundary and normal-path automation are strong, and the exact-head GitHub workflow passes. Approval is nevertheless blocked because fabricated client execution evidence passes, child-resource writes are marked committed without matching public reads, and `IDEMPOTENCY_IN_PROGRESS` is permanently rejected instead of retried.

## 4. Scope and Change Map

### Reviewed scope

- Complete `818671c5..a1b02f61` base-to-head diff: 52 files, 6,579 insertions and 40 deletions.
- Confirmed requirements and approved plan authority.
- Skill and references, canonical request identity, journal/run state machines, HTTP/recovery paths, client evidence validation, human facilitator, acceptance and browser stories.
- Exact GitHub PR base/head, draft and mergeability status, commits, changed-file set and exact-head CI.

### Excluded or unavailable scope

- Production deployment, production data, real secrets and publication.
- Raw Codex and Claude transcripts, intentionally kept local by the approved privacy design.
- Manual line-by-line review of the frozen generated OpenAPI artifact; source/checker consistency and affected routes were reviewed.

### Change map

| Area | Main change | External behavior | Risk | Validation |
|---|---|---|---|---|
| Repository Skill | Adds client-neutral workflow/recovery/report/human-boundary instructions | Compatible clients map natural language to existing API | High | Static checker and contract inspection pass |
| Demo and recovery | Adds journals, real HTTP scenario, crash recovery and run verification | Synthetic writes can be replayed and reported as verified | High | Normal tests pass; `PRR-002/003` counterexamples fail |
| Client evidence | Commits Codex/Claude PASS records and verifier | AC-15 is recorded as complete | High | `PRR-001` fabricated proof is accepted |
| Human/browser story | Adds separate facilitator and real-data Chromium path | Shows active/completed role views without public write controls | Medium | Implementation inspected; exact-head CI passes |

### Re-review reconciliation

Not applicable — initial review.

## 5. Findings

### PRR-001 — `[S1][Blocking][testing] Client evidence verifier accepts fabricated execution proof`

- **Location:** `scripts/lp04/verify-client-evidence.ts:149-211` @ `a1b02f6111777b104d794d7da0e11dd17a26a1c4`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** After parsing, the verifier never consumes `rawTranscriptSha256` or `requestIds`. It proves only the named Skill tree and that caller-supplied Idea/project/report IDs are readable and synthetic; client metadata and objective checks remain self-asserted.
- **Trigger:** A hand-written record supplies any 64-hex transcript digest, any syntactically valid request ID, PASS checks and the ID of any readable synthetic resource.
- **Impact:** `verifyClientEvidence` returns PASS even when no client session, transcript or request/resource correlation exists. That defeats AC-15 and the approved plan's explicit prohibition on static or hand-written compatibility proof.
- **Evidence:**
  - An exact-head counterexample used `invented-client`, observer `hand-written`, a zero transcript digest, unrelated request ID and invented check. A fake public Idea read was enough to return `{"accepted":true,"client":"CODEX","runId":"fabricated-proof"}`.
  - `requestIds` and `rawTranscriptSha256` are shape-checked at lines 48–139 but unused by the live verifier at lines 149–211.
  - The unit test constructs proof in memory; `npm run verify` does not invoke `demo:lp04:verify-client` for either committed record.
- **Required change:** Make PASS depend on independently checkable execution: bind the transcript digest to an actual ignored transcript during generation/verification, correlate recorded request IDs with the claimed resources through authoritative audit/history evidence, require expected objective checks, and gate both committed proof records. Otherwise leave AC-15 failed.
- **Verification:** Negative cases for absent/mismatched transcript, unrelated request IDs, arbitrary checks and an unrelated readable resource must fail; both actual Codex and Claude records must pass on the remediation head.

### PRR-002 — `[S1][Blocking][data-integrity] Child-resource writes are committed without matching public reads`

- **Location:** `scripts/lp04/scenario.ts:262-281` @ `a1b02f6111777b104d794d7da0e11dd17a26a1c4`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** `publicVerify` creates checks only for keys ending `IdeaId` or `ProjectId`. Evidence, progress, attention, conclusion and report IDs are ignored. Report-only refs cause zero GETs; project-bearing child writes prove only that the project exists, not that the returned child ID exists. Callers then persist `COMMITTED`, and `verifyRun` repeats the same omission.
- **Trigger:** Any normal or recovered child write returns 2xx, especially report submission whose result contains only a report ID, or a rerun encounters an already committed child entry.
- **Impact:** The journal and run can report `COMMITTED/VERIFIED/PASS` without ever reconciling the exact child resource. This invalidates the recovery authority and real-HTTP proof required by AC-9/12.
- **Evidence:**
  - Exact-head `publicVerify({activeReportId: ...})` completed with `childVerifyReadCount: 0`.
  - `step` and `recoverPending` call the incomplete verifier before `resolveExecutedEntry`; `verifyRun` reads only Idea and project refs.
  - The approved design requires a matching public read before success and re-reading recorded resources before skipping a committed write.
- **Required change:** Bind every child ID to its project and authoritative collection/current-report endpoint, and require the exact ID in a bounded public read before `COMMITTED`, on terminal skip and in `verifyRun`. Do not assign PASS assertions without those observations.
- **Verification:** Add normal and crash/restart cases for report plus at least one execution child. Missing or mismatched child IDs must fail before commitment; terminal reruns must make zero writes and matching public reads.

### PRR-003 — `[S2][Blocking][concurrency] IDEMPOTENCY_IN_PROGRESS is persisted as terminal rejection`

- **Location:** `scripts/lp04/scenario.ts:328-340` @ `a1b02f6111777b104d794d7da0e11dd17a26a1c4`
- **Confidence:** `High`
- **Status:** `open`
- **Observation:** Recovery treats every non-2xx response as `accepted=false` and immediately resolves the journal to `REJECTED`. It never recognizes `IDEMPOTENCY_IN_PROGRESS`, reads `retryAfterMs` or performs the approved bounded same-body/key retry.
- **Trigger:** A restarted process replays an unresolved write while the original API transaction is still processing and receives the existing 409 in-progress response.
- **Impact:** A temporary retryable state becomes permanent local rejection. The next scenario pass sees a terminal mismatch and cannot recover the original intent, violating AC-7 and the Skill's advertised recovery behavior.
- **Evidence:** An exact-head recovery counterexample returned 409 with `retryAfterMs=250`; the runner performed one POST and persisted `inProgressFinalState: "REJECTED"`.
- **Required change:** Treat this code as unresolved, validate/bound `retryAfterMs`, replay the same frozen entry at most the approved limit, and retain an honest unresolved/failed state rather than `REJECTED` on exhaustion.
- **Verification:** Add in-progress-then-success and exhaustion tests that assert identical body/key, bounded POST count, no changed intent and no premature terminal state.

## 6. Required Actions Before Merge

- [ ] `PRR-001` — independently bind and gate actual Codex/Claude execution evidence.
- [ ] `PRR-002` — reconcile every exact child resource before commitment or PASS.
- [ ] `PRR-003` — implement bounded frozen-request recovery for `IDEMPOTENCY_IN_PROGRESS`.
- [ ] Mark PR #6 ready for review only after remediation is complete; draft status is an independent merge gate.

## 7. Risk Assessment

| Category | Level | Residual risk | Mitigation / owner |
|---|---|---|---|
| Security & privacy | Medium | Client transcript provenance lacks a verifiable binding | Resolve `PRR-001` using local ignored input and sanitized derived proof; Main |
| Data integrity | High | Child writes can become PASS without authority read | Resolve `PRR-002`; Main |
| Reliability & concurrency | High | In-progress replay becomes terminal rejection | Resolve `PRR-003`; Main |
| Performance & scalability | Low | Demo is local and bounded | Preserve page/request/evidence ceilings; Main |
| API & compatibility | Medium | Runner omits one advertised API recovery response | Align with frozen error contract; Main |
| Deployment & rollback | Low | Additive tooling only; no runtime schema/API change | Feature revert removes LP-04 assets; Main |

## 8. Validation Evidence

### Reviewer-executed checks

| Command / check | Environment | Result | Exit code | Evidence / notes |
|---|---|---|---:|---|
| Locked dependency install | Node 24.14.0, npm 11.12.1, exact head | PASS | 0 | 364 packages; npm patch differs from declared version |
| `npm run build` | Node 24.14.0, exact head | PASS | 0 | TypeScript and Web build; 97.35 KiB gzip JS |
| `node --import tsx scripts/lp04/check-skill.ts` | Node 24.14.0, exact head | PASS | 0 | Skill structure/links/routes/static secret boundary |
| Targeted LP-04 unit tests | Node 24.14.0, exact head | PASS | 0 | 2 files, 13 tests |
| Fabricated client-evidence counterexample | Exact verifier, synthetic fake read | FAIL | 1 | Accepted absent transcript and unrelated request ID; `PRR-001` |
| Child-read/in-progress counterexamples | Exact runner, deterministic HTTP | FAIL | 1 | 0 child reads; 409 became REJECTED after one POST; `PRR-002/003` |
| `git diff --check` | Exact base/head | PASS | 0 | No whitespace errors across 52 files |
| Machine-readable report schema | `uv` + `jsonschema` | PASS | 0 | Schema 1.1 validation passed |

### CI / platform checks observed

| Check | Observed at | Status | Evidence / notes |
|---|---|---|---|
| `ci / verify` | `2026-08-02T01:02:14Z` | PASS | Exact head; [run 30725582980 / job 91436531725](https://github.com/zhanghao1903/idea-trace-validation/actions/runs/30725582980/job/91436531725) |
| PR identity | `2026-08-02T01:02:14Z` | PASS | Exact base/head; open, mergeable and draft |

### Checks not run

- Reviewer-local full `npm run verify` — exact-head GitHub CI ran the complete configured gate; reviewer time was focused on uncovered discriminating counterexamples.
- Raw Codex and Claude transcript inspection — intentionally unavailable under the approved privacy design; this is why `PRR-001` requires a verifiable local binding.
- Production deployment, load and real-user study — outside LP-04 scope and Review authority.

## 9. Coverage and Limitations

- All 52 changed files were classified; high-risk implementation paths were read in full or traced through their callers and tests.
- Local npm was `11.12.1`, not declared `11.16.0`; the exact configured-runtime suite is supported by successful GitHub CI.
- Raw client transcripts were unavailable by design, so the current committed proof cannot independently establish their provenance.
- Any change to base/head, checks, requirements/plan authority or live PR state requires a new review cycle.

## 10. Open Questions and Assumptions

No open questions.

Decision-critical assumptions were verified: GitHub reports the routed exact base/head; workflow run 30725582980 belongs to the reviewed head; counterexamples used temporary local proof state and fake HTTP responses only.

## 11. Non-blocking Recommendations

None.

## 12. Machine-readable Summary

- Result file: `docs/feature/lp-04-ai-skill-demo/pr-review-6-a1b02f611177.json`
- Schema: `pr-review-result.schema.json` version `1.1`

```yaml
schema_version: "1.1"
review_kind: INITIAL
decision: REQUEST_CHANGES
mergeable: false
head_sha: a1b02f6111777b104d794d7da0e11dd17a26a1c4
blocking_findings:
  - PRR-001
  - PRR-002
  - PRR-003
validation_status: FAILED
report_status: CURRENT
```
