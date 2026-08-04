# PR Review: #8 at `43e1fed8d7bd`

- Decision: **REQUEST_CHANGES**
- Review mode: read-only
- Base: `codex/v0-1-project-plan` at `99734e8e6c456e0366d28ce7d9a731b3544f0a56`
- Head: `codex/lp-05-deploy-rollback-hotfix` at `43e1fed8d7bd81eb9d507b1df31c0ba64bead4bc`
- Reviewed at: `2026-08-04T09:24:41Z`

## Outcome

Cycle 4 correctly closes the Cycle 3 bypass for RESTORE lifecycles that remain `QUIESCING`. The actual rollback now checks the fixed forward evidence before application rollback and production/restore cleanup; absent evidence uses the existing recovery, matching evidence is reused, and malformed or wrong-bound evidence is rejected without side effects. The 83-test LP-05 suite, static validator, and both exact-head GitHub checks pass.

Approval remains withheld because the new preflight returns immediately for terminal `CLEANED`/`CLEANUP_FAILED` restore lifecycles without resolving their own lifecycle-bound forward reference.

## Blocking finding

### PRR-002 — Terminal forward cleanup authority bypasses rollback preflight (`S2`)

At `scripts/lp05/deploy/rollback-cleanup.ts:2180-2185`, `resolvePendingForwardRestoreCleanup` returns `null` for a terminal RESTORE lifecycle before deriving or parsing `forward-restore-cleanup.json`. `executeRollbackWithCleanup` then runs application rollback and production cleanup before `cleanupOwnedProject` eventually resolves the terminal lifecycle reference.

A fresh-context exact-head reproduction created a legitimate `CLEANED` lifecycle referencing the forward record, replaced that record with malformed JSON, created attempt-owned production resources, and invoked actual rollback. It observed:

- application rollback called once;
- three new Docker deletes;
- no production resources remaining;
- `rollback-cleanup.json` written;
- only then rejection of the corrupted terminal authority.

This contradicts the current design and operations guide, which require malformed, digest-invalid, wrong-bound, wrong-state, or authority-conflicting forward evidence to abort before application rollback, Docker deletion, aggregate evidence, or terminal success.

Required remediation:

- Resolve a terminal RESTORE lifecycle's own `FORWARD_RESTORE_CLEANUP` reference inside the initial preflight.
- Require the fixed path plus exact attempt, project, database, result digest, terminal state, and lifecycle authority.
- Reuse exact valid terminal evidence and prove the live restore project remains empty for PASS.
- Reject malformed, wrong-bound, or inconsistent terminal authority before application rollback or production cleanup.
- Add actual-rollback regressions for valid, malformed, and wrong-bound terminal `CLEANED`/`CLEANUP_FAILED` references, including zero-side-effect assertions for rejection.

## Validation

- `npm run format:check`, `npm run lint`, and Cycle 4 `git diff --check`: PASS.
- `npm run typecheck:lp05` after building `@idea/contracts`: PASS.
- `npm run test:deployment:unit`: 7 files / 83 tests PASS.
- `npm run test:deployment:authority`: 16 tests PASS.
- `npm run test:deployment:restore-chain`: 27 tests PASS.
- Static release readiness: `LP05_RELEASE_READINESS_PASS`.
- Fresh-context terminal-reference regression: FAIL for PRR-002; corrupted terminal evidence was rejected only after application rollback, production deletion, and aggregate creation.
- GitHub Actions run `30894916886`: `verify` job `91945422809` and `lp05-candidate` job `91946064904` both succeeded for the exact head.
- Final PR snapshot: OPEN, non-draft, MERGEABLE/CLEAN, exact base and head unchanged.

## Boundary

No production host, DNS, public endpoint, real secret, deployment, merge, release, or publication was touched. Engineering Review remains review-only.
