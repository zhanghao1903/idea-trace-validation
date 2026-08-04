# PR Review: #8 at `6b41ab2e5a13`

- Decision: **REQUEST_CHANGES**
- Review mode: read-only
- Base: `codex/v0-1-project-plan` at `99734e8e6c456e0366d28ce7d9a731b3544f0a56`
- Head: `codex/lp-05-deploy-rollback-hotfix` at `6b41ab2e5a136177818cba3941a3a59a29c27079`
- Reviewed at: `2026-08-04T10:25:53Z`

## Outcome

Cycle 5 closes PRR-002. Terminal RESTORE lifecycle authority is now resolved in the initial preflight, and the four new malformed/wrong-bound `CLEANED|CLEANUP_FAILED` cases prove rejection before application rollback, production deletion, aggregate evidence, or terminal evidence. The 87-test LP-05 suite, static validator, and both exact-head GitHub checks pass.

Approval remains withheld for one adjacent mixed-result defect exposed by the required exact-valid `CLEANUP_FAILED` path.

## Blocking finding

### PRR-003 — Mixed cleanup outcomes cannot persist terminal `ROLLBACK_FAILED` (`S2`)

`persistRollbackCleanupEvidence` derives a single aggregate/reference status. With valid terminal restore `CLEANUP_FAILED`, application rollback `NOT_APPLICABLE`, and independently authorized production cleanup `PASS`, that aggregate status is `FAIL`. `executeRollbackWithCleanup` then gives the same FAIL reference to both scope lifecycles. Production needs to transition to `CLEANED`, but the lifecycle schema correctly requires a CLEANED reference to have status `PASS`, so it throws `RESOURCE_LIFECYCLE_REFERENCE_STATE`.

A temporary exact-head regression reproduced the full path:

- valid forward `CLEANUP_FAILED` authority passed the new preflight;
- application rollback ran once;
- production cleanup removed its exact container, network, and volume;
- `rollback-cleanup.json` was written with status `FAIL`;
- production lifecycle remained `QUIESCING`;
- `terminal-rollback-evidence.json` was never written.

The temporary test was removed and the review worktree returned to the exact routed head. A fresh-context independent review confirmed the same root cause.

Required remediation:

- Preserve the lifecycle invariant `CLEANED -> PASS` and `CLEANUP_FAILED -> FAIL`.
- Give each scope a compatible durable reference to its own result while retaining one exact aggregate and terminal `ROLLBACK_FAILED` authority.
- Add the missing actual-rollback case with valid terminal `CLEANUP_FAILED`.
- Require production `PASS/CLEANED`, restore `FAIL/CLEANUP_FAILED`, aggregate `FAIL`, terminal `ROLLBACK_FAILED`, and replay without another delete or immutable aggregate conflict.
- Cover the symmetric mixed result if reachable.

## Validation

- `npm run format:check`, `npm run lint`, and Cycle 5 `git diff --check`: PASS.
- `npm run typecheck:lp05` after building `@idea/contracts`: PASS.
- `npm run test:deployment:unit`: 7 files / 87 tests PASS.
- `npm run test:deployment:authority`: 16 tests PASS.
- `npm run test:deployment:restore-chain`: 27 tests PASS.
- Static release readiness: `LP05_RELEASE_READINESS_PASS`.
- Review-only valid terminal `CLEANUP_FAILED` regression: reproduced PRR-003.
- Fresh-context independent review: reproduced the same mixed-result reference mismatch.
- GitHub Actions run `30898569205`: `verify` job `91957235896` and `lp05-candidate` job `91957907128` both succeeded for the exact head.
- PR snapshot: OPEN, non-draft, MERGEABLE/CLEAN, exact base and head unchanged at the observation time.

## Boundary

No production host, DNS, public endpoint, real secret, deployment, merge, release, or publication was touched. Engineering Review remains review-only.
