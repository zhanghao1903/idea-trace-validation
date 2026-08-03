# PR #7 Engineering Review — Cycle 3

## 1. Review Metadata

| Field | Value |
|---|---|
| Repository | `zhanghao1903/idea-trace-validation` |
| Pull Request | `#7` — `LP-05 deployment and release readiness` |
| Author | `zhanghao1903` |
| Base | `codex/v0-1-project-plan` @ `46e021d261fd8a663c83430a551f5674365ccf14` |
| Head | `codex/lp-05-deployment-release` @ `b5c0606b122a22498dceadf7321a2015f37ddb39` |
| Reviewed tree | `a9d95452eb743c388f4bac9bb8a09939a0881f99` |
| Reviewed at | `2026-08-03T03:44:18Z` |
| Reviewer | Codex Engineering Lifecycle Review |
| Report status | `CURRENT` |
| Review mode | `READ_ONLY` |
| Review kind | `RE_REVIEW` |
| Previous review | `pr-review-7-7e31f4829d36.md`; base unchanged; head `7e31f4829d3691bb1c20fa7417f68add0cfbf3eb`; `REQUEST_CHANGES` |
| Previous result integrity | `pr-review-7-7e31f4829d36.json` @ SHA-256 `66ff906b4a4fde07dce7feba5f3392e3b776f4472c019bc8db48e8e26251ab5b` |
| Supersedes | Cycle 2 review commit `153fd07f85466061230168d2e4701840fd09df99` |

## 2. Decision

- **Decision:** `REQUEST_CHANGES`
- **Platform mergeable:** `true` (`OPEN`, non-Draft, `CLEAN/MERGEABLE`)
- **Blocking findings:** 2 (`PRR-005`, `PRR-006`)
- **Approval renewal:** `FAIL`
- **Merge status:** `NOT_READY`; review-only Review did not merge.
- **Rationale:** The three Cycle 2 blockers are resolved, but the new active controller can complete a real phase and then bypass both terminal journaling and rollback when post-phase authority revalidation fails. The isolated-restore environment is also removed only on the success path, so restore failures leak the exact temporary container/volume that the recovery contract requires to clean.

## 3. Executive Summary

Cycle 3 replaces caller-authored deployment evidence with active host operations, binds `pg_restore` to the exact inspected Docker container, and proves the required CSP and exact HTTPS redirect. Those changes close `PRR-002`, `PRR-003`, and `PRR-004` on the reviewed head. Two remediation-induced failure paths remain: post-operation authority expiry/drift prevents the controller's own catch block from recording `FAILED` or invoking rollback, and restore faults leave isolated resources running. CI and all reviewer-local repository checks pass, but these negative paths make the exact snapshot unsafe to merge.

## 4. Scope and Change Map

### Reviewed scope

- All 36 files and both commits in `7e31f4829d3691bb1c20fa7417f68add0cfbf3eb..b5c0606b122a22498dceadf7321a2015f37ddb39`.
- Active deployment phase execution, controller journal/revalidation, attempt locking/resume, rollback, backup and restore mutation, production identity, isolated Compose topology, external smoke, CSP/redirect, tests and operator documentation.
- The complete 89-file base-to-head PR map, using Cycle 2's full reconciliation plus a fresh pass over every current network, child-process, persistence, lock, state, backup, restore and cleanup call site.
- Exact live PR identity, draft/mergeability state and both current-head GitHub Actions checks.

### Excluded or unavailable scope

- No production server, DNS, real secret, production database, backup target or public deployment was contacted.
- No OCI/Compose deployment was executed locally; exact-head GitHub CI supplied the configured candidate job.
- Review did not mutate the feature branch, publish a GitHub review, merge, deploy or release.

### Change map

| Area | Main change | External behavior | Risk | Validation |
|---|---|---|---|---|
| Active controller | Replaces evidence bundle with controller-owned phase outputs and live operations | A deployment can reach `DEPLOYED` only after ordered operations | High | Call-graph inspection, 52 unit tests, authority-failure counterexample |
| Restore safety | Inspects production and isolated identities, then runs `pg_restore` inside exact container | Caller-selected host socket cannot redirect restore | High | Exact-container unit test and code trace |
| Edge security | Adds exact CSP plus same-origin HTTPS redirect validation | Missing/unsafe CSP and wrong redirect fail smoke | Medium | Negative unit tests, static validator, CI |
| Recovery | Adds stale-lock interruption/resume and phase reconciliation | One crashed attempt may resume | High | State/lock inspection; failure-boundary adversarial pass |
| Documentation/build | Documents active controller and fixes candidate command | Operator commands match implementation | Low | Diff inspection and static readiness validation |

### Re-review reconciliation

| Previous report | Previous base/head | Previous decision | Current base/head | Delta | Old decision state |
|---|---|---|---|---|---|
| `pr-review-7-7e31f4829d36.md` | `46e021d…` / `7e31f482…` | `REQUEST_CHANGES` | `46e021d…` / `b5c0606…` | `7e31f482…b5c0606` | `SUPERSEDED` |

- **Delta commits reviewed:** `29b85d19002f0376d2e1831be12238916e319822`, `b5c0606b122a22498dceadf7321a2015f37ddb39`
- **Delta files reviewed:** all 36 files listed in the machine-readable result.
- **Unclassified changes:** none.
- **Full base-to-head diff reconciled:** true.

#### Finding closure ledger

| Finding | Previous status | Current status | Current-head evidence | Negative regression |
|---|---|---|---|---|
| PRR-001 | resolved | resolved | External smoke still rejects imported observations and actively observes TLS/HTTP/runtime facts. | 52 LP-05 tests pass. |
| PRR-002 | open | resolved | `controller-cli.ts` accepts no evidence bundle; `createActiveDeploymentOracles` invokes host operations and reconciles persisted outputs. | Ordered fresh/upgrade and every-phase fault tests pass; forged bundle is no longer an input shape. |
| PRR-003 | open | resolved | Production identity is actively inspected; isolated DB identity comes from `docker exec`; mutation uses `docker exec ... <exact-container-id> pg_restore`. | Incomplete production identity and destination mismatch tests fail before spawn. |
| PRR-004 | open | resolved | Production/test Caddyfiles set the exact CSP; smoke validates it and exact same-host HTTPS `Location`. | Missing/altered CSP and absent/wrong/downgraded redirect tests pass. |

#### Forward-risk surfaces

| Surface | Risk triggers | Affected paths | Discriminating checks | Result |
|---|---|---|---|---|
| Post-phase authority boundary | mutation recovery, state transition | `controller.ts`, `controller-cli.ts` | Fail revalidation after a phase but before journal append; count rollback and persistence | **FAIL — PRR-005** |
| Isolated restore lifecycle | data integrity, deployment recovery | `host-active-operations.ts`, `rollback.ts` | Inject faults after restore Compose creation through migration/demo/cleanup | **FAIL — PRR-006** |
| Container-bound restore | trust boundary, data integrity | `production-runtime.ts`, `restore-runtime.ts`, `restore.ts` | Mismatched/incomplete identity and exact Docker-exec destination | PASS |
| Public edge policy | public contract, security | `Caddyfile*`, `security.ts`, `external.ts` | Missing/unsafe CSP and wrong/downgraded redirect | PASS |

#### Approval-renewal gate

- [x] Old decision invalidated.
- [x] Previous findings revalidated at current head.
- [x] All delta changes classified and full PR diff reconciled.
- [x] Current-head local validation and CI complete.
- [ ] Forward-risk review has no failing result.
- [ ] No open blocker remains.
- **Independent pass:** `NOT_AVAILABLE` — sub-agent delegation was not authorized; the same reviewer performed a separate second pass over all newly introduced side-effect, state, recovery and cleanup call sites.

## 5. Findings

### PRR-005 — [S1][Blocking][Reliability] Post-phase authority failure skips both terminal journaling and rollback

- **Location:** `scripts/lp05/deploy/controller.ts:122-175` @ `b5c0606b122a22498dceadf7321a2015f37ddb39`
- **Confidence:** High
- **Status:** open
- **Observation:** `advance()` always calls `revalidate()` before persistence. If a live phase succeeds but this post-phase revalidation fails (for example, authorization expires during a long backup/smoke/restore, or the request changes), control enters the catch block. The first recovery action is another `advance(FAILED)`, which repeats the same failing revalidation and throws before `FAILED`, `ROLLING_BACK`, or rollback can occur. The CLI then releases its lock while the persisted attempt remains at the prior forward state. Active `pg_dump`/`age` and restore pipelines also have no controller deadline, so the design's four-hour bound is not enforced while an oracle is blocked.
- **Trigger:** Begin a valid phase before envelope expiry, complete its external operation after expiry, then reach the pre-append `revalidate`; equivalently, make the bound request/runtime drift after the operation returns.
- **Impact:** A candidate app/Caddy, migration, backup or restore-side effect can complete without a matching journal append, terminal failure record, ingress disable or application rollback. Because the clean lock is released while the record is still a forward state, ordinary re-entry is rejected, leaving an ambiguous partially mutated deployment that contradicts AC 11 and the approved failure/recovery contract.
- **Evidence:**
  - Pure local exact-head counterexample returned `{"error":"AUTHORITY_EXPIRED_AFTER_PHASE","externalPhaseCalls":1,"revalidations":3,"rollbackCalls":0}`.
  - `runDeployment` calls `advance()` at the success boundary and then calls the same `advance()` for `FAILED`; both invoke `revalidate` before any persistence (`controller.ts:122-175`).
  - Controller CLI releases the target lock in `finally` without repairing the forward record (`controller-cli.ts:244-259`).
  - Design §§5.3–5.4 require every failure to become terminal/rollback and cap an attempt at four hours; backup and restore child pipelines have no timeout (`backup.ts:56-125`, `restore.ts:75-111`).
- **Required change:** Separate authorization for new forward mutations from safety recovery. After any phase-side failure, guarantee one durable terminal/rollback path under the already-bound attempt even when forward authority revalidation fails, without authorizing another forward phase. Enforce the attempt deadline and bounded subprocess termination, preserve exact side-effect ordering, and make a subsequent invocation observe a recoverable terminal/interrupted record rather than a clean-lock forward state.
- **Verification:** For every phase boundary, inject expiry/request drift after the oracle returns but before append; assert the external operation count, exactly one rollback/ingress-disable, durable `FAILED -> ROLLING_BACK -> ROLLED_BACK|ROLLBACK_FAILED`, and no later forward operation. Add a hung backup/restore process case that terminates at the deadline and reaches the same recovery path.

### PRR-006 — [S2][Blocking][Deployment] Restore faults leave the isolated database environment running

- **Location:** `scripts/lp05/deploy/host-active-operations.ts:860-1098` @ `b5c0606b122a22498dceadf7321a2015f37ddb39`
- **Confidence:** High
- **Status:** open
- **Observation:** `RESTORE_ENVIRONMENT` creates the isolated PostgreSQL project, but the only `compose down --volumes` call occurs near the end of the successful `RESTORE` case. There is no phase-scoped `finally` or recovery cleanup. `operations.rollback` delegates only to production application rollback, whose adapter stops/restores production `app` and `caddy` and knows nothing about the restore project.
- **Trigger:** Fail after restore Compose creates PostgreSQL and before the success-path `down` completes: destination inspection, decrypt/import, migration, app readiness, demo replay, migration verification, production reinspection, cleanup verification, or a process crash in that interval.
- **Impact:** The loopback app, restored database container and persistent volume can remain after a failed deployment, retaining restored synthetic data, consuming disk/ports, blocking deterministic reuse of the same restore project, and violating the explicit recovery requirement to clean only the isolated environment while preserving production and the backup.
- **Evidence:**
  - Restore project creation is at `host-active-operations.ts:860-915`; success-only removal is at `1029-1065`.
  - `createActiveDeploymentOracles.rollback` calls only `options.rollback`; `rollbackApplication`/`createHostRollbackAdapter` operate solely on the production Compose project.
  - The every-phase fault test uses abstract oracles and only asserts a generic rollback call; it does not instantiate host operations or count restore-project cleanup (`deployment.unit.test.ts:913-926`).
  - Requirements failure expectations explicitly require cleanup of the isolated temporary environment after restore-smoke failure.
- **Required change:** Own the exact restore project/container/volume lifecycle across success, handled failure and stale-lock recovery. After target creation, clean only resources whose project/container/volume identities match the persisted isolated target, record the cleanup outcome, and never route this through production rollback. Preserve the backup and production resources.
- **Verification:** Inject a fault at every operation from restore environment creation through post-restore production inspection, plus a crash/recovery case; each must leave zero matching restore containers/volumes, preserve production byte-identity and backup files, and record an auditable cleanup result before terminalizing.

## 6. Required Actions Before Merge

- [ ] `PRR-005` — make post-operation authority/deadline failures terminal and rollback-safe without enabling new forward mutations.
- [ ] `PRR-006` — clean the exact isolated restore resources on every failure and crash-recovery path.

## 7. Risk Assessment

| Category | Level | Residual risk | Mitigation / owner |
|---|---|---|---|
| Security & privacy | Low | No new secret disclosure found; exact CSP/redirect contract is now enforced. | Keep active secret-absence smoke. |
| Data integrity | Medium | Isolated restored data can remain after failure. | Resolve PRR-006. |
| Reliability & concurrency | High | Authority/deadline failure can strand a forward state with no rollback. | Resolve PRR-005. |
| Performance & scalability | Medium | Backup/restore child pipelines lack a controller-enforced deadline. | Include bounded process termination in PRR-005. |
| API & compatibility | Low | No product API/schema change; CSP policy appears compatible with built self-hosted assets. | Retain browser/candidate CI. |
| Deployment & rollback | High | Failure terminalization and restore cleanup are incomplete. | Resolve PRR-005 and PRR-006 before approval. |

## 8. Validation Evidence

### Reviewer-executed checks

| Command / check | Environment | Result | Exit code | Evidence / notes |
|---|---|---|---:|---|
| `npm ci --ignore-scripts --engine-strict=false` | macOS; Node 26.0.0; npm 11.12.1; isolated exact-head worktree | PASS | 0 | 364 locked packages installed; runtime differs from declared Node 24/npm 11.16.0. |
| `npm run test:deployment:unit` | exact head | PASS | 0 | 6 files, 52/52 tests. |
| `npm run typecheck` | exact head | PASS | 0 | Repository TypeScript and Web E2E checks pass. |
| `npm run typecheck:lp05` | exact head | PASS | 0 | All non-test LP-05 scripts compile under the dedicated config. |
| `npm run deploy:lp05:validate` | exact head; local static validation | PASS | 0 | `LP05_RELEASE_READINESS_PASS`; required only a local tsx Unix IPC socket. |
| `git diff --check 46e021d…b5c0606` | local git objects | PASS | 0 | No whitespace errors in complete PR diff. |
| Post-phase revalidation counterexample | exact-head modules; synthetic in-process oracles; no external mutation | FAIL | 0 | One phase call, three revalidations, zero rollback calls; reproduced PRR-005. |
| Restore failure-path call-graph audit | exact-head source and tests | FAIL | 0 | No cleanup path exists outside success-only `compose down --volumes`; reproduced PRR-006 statically. |

### CI / platform checks observed

| Check | Observed at | Status | Evidence / notes |
|---|---|---|---|
| `ci / verify` | `2026-08-03T03:44:18Z` | PASS | Run `30781026658`, job `91585535396`, exact head. |
| `ci / lp05-candidate` | `2026-08-03T03:44:18Z` | PASS | Run `30781026658`, job `91585889594`, exact head. |

### Checks not run

- Real HTTPS deployment, production migration, encrypted backup and PostgreSQL restore — no separately authorized target; outside review-only authority.
- Reviewer-local OCI build/Compose candidate acceptance — exact-head GitHub `lp05-candidate` job is authoritative for the configured environment.
- Fresh-context sub-reviewer — delegation was not authorized; a separate same-reviewer adversarial pass was performed and disclosed.

## 9. Coverage and Limitations

- **Reviewed:** complete Cycle 3 delta, prior blocker closure, full PR map, all high-risk deployment, state, network, child-process, backup/restore, rollback and edge-policy paths.
- **Not reviewed by execution:** actual Docker/Compose host mutations, public DNS/TLS, production secrets/data, external backup storage and release operations.
- **Missing context:** authorized production target and release authority, intentionally absent at code-review stage.
- **Staleness condition:** any base/head/check change invalidates this decision and requires a new review cycle.

## 10. Open Questions and Assumptions

### Open questions

None that change the current `REQUEST_CHANGES` decision.

### Assumptions

| Assumption | Decision-critical | Status | Evidence |
|---|---|---|---|
| GitHub PR #7 still binds the accepted exact base/head | true | VERIFIED | Live PR metadata was read at review start and will be refreshed before result preparation. |
| CI checks belong to exact head `b5c0606…` | true | VERIFIED | Both check runs are attached to that exact PR head. |
| Counterexamples perform no production/network mutation | false | VERIFIED | Pure in-process mock oracles and static call-graph inspection only. |

## 11. Non-blocking Recommendations

None beyond the blocking recovery fixes.

## 12. Machine-readable Summary

- Result file: `pr-review-7-b5c0606b122a.json`
- Schema: `1.1`

```yaml
schema_version: "1.1"
review_kind: RE_REVIEW
decision: REQUEST_CHANGES
mergeable: true
head_sha: b5c0606b122a22498dceadf7321a2015f37ddb39
blocking_findings:
  - PRR-005
  - PRR-006
validation_status: FAILED
report_status: CURRENT
```
