# PR Review: #8 at `07ec4ecd05f8`

- Decision: **REQUEST_CHANGES**
- Review mode: read-only
- Base: `codex/v0-1-project-plan` at `99734e8e6c456e0366d28ce7d9a731b3544f0a56`
- Head: `codex/lp-05-deploy-rollback-hotfix` at `07ec4ecd05f80672a478f1ab5021c0d762b05275`
- Reviewed at: `2026-08-04T08:10:04Z`

## Outcome

Cycle 2 fixes the ordinary path identified by PRR-001. Forward restore cleanup now writes a fixed, digest-bound authority, transitions the V2 lifecycle to `CLEANED`, and lets a later rollback reuse that exact result without another deletion. The committed LP-05 suites, static readiness validator, and both exact-head GitHub checks pass.

PRR-001 nevertheless remains blocking because the repair starts its durable forward evidence only after `cleanupOwnedProject` has completed every destructive delete. A process death after deletion but before `forward-restore-cleanup.json` is written leaves `QUIESCING`, a nonempty frozen set, no reference, and an empty live project. Re-entry treats that state as set drift and returns `FAIL`.

## Blocking finding

### PRR-001 — Deletion can still precede every durable forward-cleanup authority (`S2`)

The critical order in `cleanupForwardRestoreProject` is:

1. `cleanupOwnedProject` persists `QUIESCING`, deletes the frozen resources, proves empty, and returns `PASS`.
2. Only then does `persistForwardRestoreCleanupEvidence` write the replayable record.

Two independent exact-head counterexamples interrupted between those steps. The Review fixture re-entered the forward wrapper and received `FAIL` instead of `PASS`. A fresh-context reviewer entered the actual `executeRollbackWithCleanup` path: all three resources were already gone and no second delete occurred, but the result was `ROLLBACK_FAILED` and the restore lifecycle became `CLEANUP_FAILED`.

The committed “lifecycle-write crash” test manually writes `forward-restore-cleanup.json` before replay. It proves the later evidence-written/lifecycle-not-written boundary, but not the earlier deletion-complete/evidence-not-written boundary.

Required remediation:

- Persist enough durable cleanup progress before or during deletion, or safely reconcile `QUIESCING + no forward evidence + empty live project` against the exact frozen authority.
- Do not convert an already completed, exactly scoped deletion to cleanup failure solely because the evidence write was interrupted.
- Add a regression that enters the actual rollback path after the final delete but before the forward evidence write and requires `ROLLED_BACK`, a resolvable PASS authority, `CLEANED`, and no second delete.

## Validation

- `npm run format:check`, `npm run lint`, and remediation `git diff --check`: PASS.
- `npm run typecheck:lp05` after building `@idea/contracts`: PASS.
- `npm run test:deployment:unit`: 7 files / 79 tests PASS.
- `npm run test:deployment:authority`: 16 tests PASS.
- `npm run test:deployment:restore-chain`: 27 tests PASS.
- Static release readiness: `LP05_RELEASE_READINESS_PASS`.
- Review-only deletion-before-evidence regression: FAIL as expected for PRR-001 (`expected PASS`, `received FAIL`). The temporary test was removed and the worktree returned to the exact routed feature snapshot before report creation.
- Fresh-context independent rollback regression: same PRR-001 failure through `executeRollbackWithCleanup`.
- GitHub Actions run `30889498312`: `verify` job `91928036633` and `lp05-candidate` job `91928642162` both succeeded for the exact head.

## Boundary

No production host, DNS, public endpoint, real secret, deployment, merge, release, or publication was touched. Engineering Review remains review-only.
