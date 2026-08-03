# PR #7 Engineering Review — Cycle 4

## 1. Review Metadata

| Field | Value |
|---|---|
| Repository | `zhanghao1903/idea-trace-validation` |
| Pull Request | `#7` — `LP-05 deployment and release readiness` |
| Author | `zhanghao1903` |
| Base | `codex/v0-1-project-plan` @ `46e021d261fd8a663c83430a551f5674365ccf14` |
| Head | `codex/lp-05-deployment-release` @ `696859bcb186d100df9495ea39a413bd739112db` |
| Reviewed tree | `087132d460fb24b316ff4fd6ccf162ecc58092f8` |
| Reviewed at | `2026-08-03T05:00:55Z` |
| Reviewer | Codex Engineering Lifecycle Review |
| Report status | `CURRENT` |
| Review mode | `READ_ONLY` |
| Review kind | `RE_REVIEW` |
| Previous review | `pr-review-7-b5c0606b122a.md`; base unchanged; head `b5c0606b122a22498dceadf7321a2015f37ddb39`; `REQUEST_CHANGES` |
| Previous result integrity | `pr-review-7-b5c0606b122a.json` @ SHA-256 `796e792c32742d848101eff9e180075ab09d132fd7297a711d89664dacffdffd` |
| Supersedes | Cycle 3 review commit `bf1309eaaf916531ad0dbe26fa318ed8cf27676f` |

## 2. Decision

- **Decision:** `REQUEST_CHANGES`
- **Platform mergeable:** `true` (`OPEN`, non-Draft, `CLEAN/MERGEABLE`)
- **Review-safe mergeable:** `false`
- **Blocking findings:** 2 (`PRR-005`, `PRR-006`)
- **Approval renewal:** `WITHHELD`
- **Merge status:** `NOT_REQUESTED`; review-only Review did not merge.
- **Rationale:** The exact-head checks pass, the old post-phase revalidation loop is fixed, and restore lifecycle cleanup works for quiescent resources. The controller can nevertheless hard-stop and return `ROLLED_BACK` while an `AbortSignal`-ignoring forward operation continues. The real host Compose path ignores that signal, so late mutation can invalidate terminal rollback and recreate restore resources after `CLEANED`.

## 3. Executive Summary

Cycle 4 adds safety-only failure transitions, immutable runtime binding, cooperative backup/restore child cancellation, late stale-lock terminalization, and an attempt-bound restore lifecycle. Those are substantive improvements and preserve the four earlier resolved findings. Approval is still withheld because terminal recovery does not fence or join a forward oracle that ignores cancellation. An exact-head counterexample returned `ROLLED_BACK` with one rollback and only afterward executed its forward mutation; the same ordering is reachable in host Compose operations, leaving both `PRR-005` and `PRR-006` open.

## 4. Scope and Change Map

### Reviewed scope

- The sole remediation commit `696859bcb186d100df9495ea39a413bd739112db` and all 18 files changed from Cycle 3.
- Current-head closure evidence for `PRR-001` through `PRR-006`.
- Controller authority/deadline/persistence/terminal state, runtime binding, stale-lock recovery, child-process cancellation, restore intent/resource cleanup, tests, contracts and operator documentation.
- The complete 89-file base-to-head risk map, reusing Cycle 3's full reconciliation and retracing every Cycle 4 affected behavior path.
- Exact live PR identity, draft/mergeability state and both exact-head GitHub checks.

### Excluded or unavailable scope

- No production server, DNS, secret, production database, backup target or public deployment was contacted.
- No reviewer-local OCI/Compose deployment was run; exact-head GitHub CI supplied the configured candidate job.
- Review did not mutate the feature branch, publish a GitHub review, merge, deploy or release.

### Delta reconciliation

| Area | Delta | External behavior | Risk | Result |
|---|---|---|---|---|
| Terminal recovery | Separate forward revalidation from safety-only failure/rollback persistence | Post-phase authority failure reaches a terminal suffix | High | Partially fixed; deadline race remains |
| Deadline | Add controller AbortSignal/hard stop and child-pipeline termination | Cooperative `pg_dump`/`age`/`pg_restore` stop | High | FAIL for non-cooperative host operations |
| Restore lifecycle | Persist `CREATING/READY/CLEANED/CLEANUP_FAILED` and exact labelled cleanup | Failure/crash cleanup becomes durable | High | FAIL when creator outlives cleanup |
| State/contracts | Add runtime binding and legal FAILED transitions from interrupted states | Restart cannot change runtime authority | Medium | PASS |
| Docs/status | Document Cycle 3 remediation and preserve external boundary | No external PASS or approval is claimed | Low | PASS |

All 18 delta files are classified. No generated, binary, vendored or excluded delta file exists.

### Prior finding revalidation

| Finding | Previous | Current | Evidence |
|---|---|---|---|
| `PRR-001` | resolved | resolved | External imports remain rejected; active smoke remains authority-bound. |
| `PRR-002` | resolved | resolved | Future evidence bundle remains absent; active outputs remain controller-owned. |
| `PRR-003` | resolved | resolved | Production/restore identities remain live-inspected and restore stays exact-container bound. |
| `PRR-004` | resolved | resolved | Exact CSP and same-host HTTPS redirect proof/negatives remain intact. |
| `PRR-005` | open | open | Cooperative recovery is fixed, but ignored cancellation mutates after terminal return. |
| `PRR-006` | open | open | Quiescent cleanup is fixed, but an in-flight creator can add resources after `CLEANED`. |

### Forward-risk review

- **Deadline/cancellation/cleanup — FAIL:** `Promise.race` gives up after a five-second abort grace without joining the oracle. `RunDocker` accepts no signal; restore Compose creation and subsequent host operations can continue during recovery.
- **Runtime binding/state contract — PASS:** producer, digest, atomic persistence, reload comparison, legal transitions and stale-lock consumers are internally consistent and safety recovery does not grant a new forward phase.
- **Documentation/status — PASS:** the external deployment chain remains explicitly not run and project status remains `In Progress`.

## 5. Findings

### PRR-005 — [S1][Blocking][Reliability] Deadline recovery can return `ROLLED_BACK` while a forward mutation is still running

- **Location:** `scripts/lp05/deploy/controller.ts:136-161` @ `696859bcb186d100df9495ea39a413bd739112db`
- **Confidence:** High
- **Observation:** `runOracle` aborts the signal at the deadline but rejects after a fixed five-second grace whether or not the oracle stopped. Recovery then persists and returns the terminal suffix. Host `RunDocker` has no signal and its independent `execFile` timeout is 180 seconds; 28 host calls use it, including restore Compose creation and mutation. These operations continue after the raced Promise settles.
- **Trigger:** Begin a Docker Compose or other signal-ignoring forward operation shortly before the four-hour boundary.
- **Impact:** The attempt can release its lock and report `ROLLED_BACK`, then the old process mutates resources afterward. The journal no longer describes live state and a later authorized attempt can race the old mutation.
- **Evidence:** The exact-head in-process counterexample returned `{currentState:ROLLED_BACK,rollbackCalls:1,lateForwardMutationAtTerminalReturn:false,lateForwardMutationAfterTerminalReturn:true}`. The committed hung-oracle test cooperatively rejects on abort and therefore cannot detect this behavior.
- **Required change:** Propagate cancellation to every active mutation and await definitive process/request termination, or reconcile/fence the in-flight operation before terminal recovery may complete. Never return terminal state while a prior forward actor can still mutate.
- **Verification:** Delay a real mocked host operation while ignoring abort. After terminal return and an additional delay, side-effect count and resource state must remain unchanged; rollback must occur exactly once and only after the forward actor is quiescent.

### PRR-006 — [S2][Blocking][Deployment] Restore cleanup can be recorded before an in-flight Compose operation creates resources

- **Location:** `scripts/lp05/deploy/host-active-operations.ts:1192-1254` @ `696859bcb186d100df9495ea39a413bd739112db`
- **Confidence:** High
- **Observation:** The restore lifecycle correctly cleans resources that are already visible and quiescent. `RESTORE_ENVIRONMENT` persists `CREATING`, then calls a signal-unaware `compose up`. At deadline, rollback cleanup can observe no resources, persist `CLEANED`, and return before that older Compose operation creates the container/volume.
- **Trigger:** Keep restore Compose creation pending across the deadline so resources appear after cleanup's observations.
- **Impact:** A failed attempt can retain the isolated DB/app/volume despite a durable `CLEANED` claim, preserving restored data and blocking deterministic reuse.
- **Evidence:** `host-active-operations.ts:685-796` performs observe/down/re-observe/persist but owns no creator fence. Existing lifecycle tests use static resource lists and the deadline test uses a cooperative abstract oracle; neither schedules resource creation after cleanup.
- **Required change:** Terminate or join every restore creator before cleanup begins, bind cleanup to a quiescent generation/lease, and prove resources cannot appear after `CLEANED`.
- **Verification:** Inject deadline/crash faults before, during and after Compose creation, migration, app startup and story replay. Await all actors, then assert zero exact resources after a post-terminal delay while backup bytes and production identity remain unchanged.

Resolved `PRR-001` through `PRR-004` retain their stable IDs and full fingerprints in the machine-readable result.

## 6. Required Actions

1. Resolve `PRR-005` by fencing and joining all forward mutations before terminal rollback can complete.
2. Resolve `PRR-006` by proving no restore resource can appear after `CLEANED`, including deadline and crash races.
3. Push a new exact head, rerun required checks, and request a new review cycle. Earlier approval cannot be inherited.

## 7. Risk Assessment

| Category | Level | Assessment |
|---|---|---|
| Reliability/concurrency | High | Terminal state can precede the actual end of forward mutation. |
| Deployment/rollback | High | Cleanup can race an in-flight restore creator and become stale. |
| Data integrity | Medium | Late restore resources may retain a copy of synthetic restored data and collide with the next attempt. |
| Security/privacy | Low | No new secret disclosure or production-target restore route was found. |
| Compatibility | Low | Runtime binding and public contract changes are closed and internally propagated. |

## 8. Validation Evidence

### Reviewer runs

| Command | Result | Evidence |
|---|---|---|
| `npm ci --ignore-scripts --engine-strict=false` | PASS | 364 locked packages; Node 26/npm 11.12.1 differs from declared Node 24/npm 11.16.0. |
| `npm run test:deployment:unit` | PASS | 6 files, 58 tests. |
| `npm run typecheck` | PASS | Repository build-mode and Web E2E checks passed. |
| `npm run typecheck:lp05` | PASS | Sequential rerun passed; the initial concurrent invocation raced workspace type generation. |
| `npm run deploy:lp05:validate` | PASS | `LP05_RELEASE_READINESS_PASS`; escalation only allowed local tsx IPC. |
| `git diff --check 46e021d…696859b` | PASS | Complete PR diff has no whitespace errors. |
| Exact-head ignored-abort counterexample | FAIL | Terminal rollback returned before the forward mutation occurred. |

### GitHub checks

| Check | Observed at | Result | Evidence |
|---|---|---|---|
| `ci / verify` | `2026-08-03T05:00:55Z` | PASS | Run `30784755955`, job `91596096924`, exact head. |
| `ci / lp05-candidate` | `2026-08-03T05:00:55Z` | PASS | Run `30784755955`, job `91596393529`, exact head. |

## 9. Coverage and Limitations

- Current-head tree, all 18 remediation files, every old finding and all changed recovery/cancellation/cleanup paths were reviewed.
- The PR as a whole contains 89 files and more than 14,000 additions; Cycle 4 reuses Cycle 3's full-PR reconciliation and freshly reviews the complete delta and affected high-risk paths.
- Reviewer-local Node/npm differ from the declared toolchain; exact-head GitHub CI is the configured-runtime authority.
- No real deployment, external HTTPS, migration, encrypted production backup or restore was run because no target-specific authorization exists.
- No fresh-context sub-reviewer was used because delegation was not authorized; the same reviewer performed a distinct adversarial second pass.

## 10. Open Questions and Assumptions

No decision-blocking open question remains.

- PR identity assumption: verified live as OPEN, non-Draft, exact base/head and `CLEAN/MERGEABLE`.
- Check identity assumption: verified both required checks are SUCCESS for exact head `696859bcb186d100df9495ea39a413bd739112db`.
- Counterexample boundary assumption: verified it used only in-process synthetic oracles and no external mutation.

## 11. Non-blocking Recommendations

None. The actionable work is represented by the two blocking findings.

## 12. Machine-readable Summary

See `docs/feature/lp-05-deployment-release/pr-review-7-696859bcb186.json`.

```json
{
  "decision": "REQUEST_CHANGES",
  "blocking": ["PRR-005", "PRR-006"],
  "checks": "PASSING",
  "merge": "NOT_REQUESTED",
  "head": "696859bcb186d100df9495ea39a413bd739112db"
}
```
