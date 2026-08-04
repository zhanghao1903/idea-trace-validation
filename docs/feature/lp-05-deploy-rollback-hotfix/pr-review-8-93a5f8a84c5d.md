# PR Review: #8 at `93a5f8a84c5d`

- Decision: **REQUEST_CHANGES**
- Review mode: read-only
- Base: `codex/v0-1-project-plan` at `99734e8e6c456e0366d28ce7d9a731b3544f0a56`
- Head: `codex/lp-05-deploy-rollback-hotfix` at `93a5f8a84c5dda8edb64ea89075397728aa12ddb`
- Reviewed at: `2026-08-04T07:16:49Z`

## Outcome

The configured PostgreSQL principal, attempt-bound Docker labels, identity-safe deletion, strict application/cleanup evidence separation, and injected fresh-install rollback all behave as intended at this head. The exact-head LP-05 suites, static release validator, real PostgreSQL 17.10 Docker acceptance, and both GitHub checks pass.

One lifecycle integration defect blocks approval. The normal forward `RESTORE` phase calls `cleanupIsolatedRestoreEnvironment`, which forwards `cleanupOwnedProject` directly. That helper persists `QUIESCING`, deletes the frozen restore resources, proves quiescence, and returns `PASS`; it does not persist the aggregate cleanup reference or transition the V2 lifecycle to `CLEANED`. Those terminal steps exist only in `executeRollbackWithCleanup`.

## Blocking finding

### PRR-001 — Forward restore cleanup never completes its V2 lifecycle (`S2`)

An exact-head review-only regression created a READY restore lifecycle and ran the cleanup helper to `PASS`. Reading `restore-lifecycle.json` immediately afterwards returned `state=QUIESCING`, not `CLEANED`.

This is not only an audit-state mismatch. If `PRODUCTION_UNCHANGED` or `POST_RESTORE_SMOKE` fails after the normal restore cleanup, automatic rollback re-enters the restore cleanup with an empty live project but a non-empty frozen `ownedBeforeCleanup` set. It cannot reconcile the already successful deletion and can terminate `ROLLBACK_FAILED` instead of completing the safe fresh-install rollback.

Required remediation:

- Persist a compatible immutable cleanup record/reference for the forward restore cleanup.
- Transition the exact `QUIESCING` lifecycle to `CLEANED` before returning `PASS`.
- Make replay resolve and reconcile the terminal cleanup authority rather than comparing the empty live set to the old frozen set.
- Add a regression that requires `CLEANED` after forward restore cleanup and then proves a later phase failure can reuse that authority without another deletion or `ROLLBACK_FAILED`.

## Validation

- `npm run format:check`, `npm run lint`, and full-PR `git diff --check`: PASS.
- `npm run typecheck:lp05`: PASS.
- `npm run test:deployment:unit`: 7 files / 77 tests PASS.
- `npm run test:deployment:authority`: 16 tests PASS.
- `npm run test:deployment:restore-chain`: 27 tests PASS.
- Static release readiness: `LP05_RELEASE_READINESS_PASS`.
- Real Docker hotfix acceptance: `LP05_HOTFIX_DOCKER_ACCEPTANCE_PASS`.
- Review-only terminal-state regression: FAIL as expected for PRR-001 (`expected CLEANED`, `received QUIESCING`). The temporary test was removed and the worktree returned clean before report creation.
- GitHub Actions run `30885981570`: `verify` job `91917176110` and `lp05-candidate` job `91917744612` both succeeded for the exact head.

## Boundary

No production host, DNS, public endpoint, real secret, deployment, merge, release, or publication was touched. Engineering Review remains review-only.
