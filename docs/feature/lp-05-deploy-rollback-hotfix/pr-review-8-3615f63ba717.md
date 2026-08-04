# PR Review: #8 at `3615f63ba717`

- Decision: **REQUEST_CHANGES**
- Review mode: read-only
- Base: `codex/v0-1-project-plan` at `99734e8e6c456e0366d28ce7d9a731b3544f0a56`
- Head: `codex/lp-05-deploy-rollback-hotfix` at `3615f63ba7176346e4e82c73516529226b31a97b`
- Reviewed at: `2026-08-04T12:05:17Z`

## Outcome

Cycle 7 resolves both Cycle 6 blockers. Persisted aggregate recovery now reuses the original application rollback and scoped cleanup results without another callback or delete, resolving PRR-003. The active oracle and controller now propagate the verified aggregate terminal state, resolving PRR-004. The 91-test deployment unit suite, authority and restore-chain suites, typecheck, format, lint, static release readiness, and both exact-head GitHub checks pass.

Approval remains withheld for one new recovery defect.

## Blocking finding

### PRR-005 — Persisted aggregate replay skips live cleanup reconciliation (`S2`)

`executeRollbackWithCleanup` resolves `rollback-cleanup.json` first and immediately calls `finalizePersistedRollback`. That function completes lifecycle journals and writes terminal evidence from persisted observations, but it does not re-observe current Docker resources. The live cleanup/reconciliation paths are bypassed.

A review-only regression interrupted after aggregate persistence, recreated the exact attempt-owned restore container, then retried. Retry resolved successfully, wrote terminal authority, issued no Docker observation or deletion, and left the recreated container present. A fresh-context reviewer independently reproduced the same stale success with a separate fixture.

This contradicts the design requirement that completed cleanup replay requires current resources to remain empty and conflicts otherwise. The result can claim cleanup completion while exact-owned containers, networks or volumes still exist.

Required remediation: reuse durable application and cleanup results without repeating mutation, but actively reconcile every applicable PASS or preserved NOT_APPLICABLE live state before finalizing or replaying terminal authority. Nonempty or drifted state must reject without a new delete or success transition. Add restore reappearance, production reappearance, and upgrade resource-set drift regressions with exact side-effect counts.

## Validation

- Contracts build and `typecheck:lp05`: PASS.
- `format:check`, `lint`, and `git diff --check`: PASS.
- `test:deployment:unit`: 7 files / 91 tests PASS.
- `test:deployment:authority`: 16 tests PASS.
- `test:deployment:restore-chain`: 27 tests PASS.
- Static release readiness: `LP05_RELEASE_READINESS_PASS`.
- Review-only post-aggregate resource-reappearance regression: reproduced PRR-005.
- Fresh-context independent review: independently reproduced PRR-005.
- GitHub Actions run `30905412388`: `verify` job `91979229293` and `lp05-candidate` job `91979885284` both succeeded for the exact head.
- PR snapshot: OPEN, non-draft, MERGEABLE/CLEAN, exact base and head unchanged at observation time.

## Boundary

No production host, DNS, public endpoint, real secret, deployment, merge, release, or publication was touched. Engineering Review remains review-only.
