# PR Review: #8 at `f02803a8ac0f`

- Decision: **REQUEST_CHANGES**
- Review mode: read-only
- Base: `codex/v0-1-project-plan` at `99734e8e6c456e0366d28ce7d9a731b3544f0a56`
- Head: `codex/lp-05-deploy-rollback-hotfix` at `f02803a8ac0f2f7bdec5c4244f07f4739cf6b45c`
- Reviewed at: `2026-08-04T11:09:29Z`

## Outcome

Cycle 6 fixes the per-scope reference mismatch: direct mixed production/restore PASS/FAIL results can now finalize both lifecycles and write terminal evidence. The 89-test LP-05 suite, typecheck, formatting, lint, static readiness, and both exact-head GitHub checks pass.

Approval remains withheld for two recovery/state defects.

## Blocking findings

### PRR-003 — Mixed cleanup recovery still conflicts with the durable aggregate (`S2`)

The committed replay regression uses the same fixed application rollback object twice. Production calls `rollbackApplication()` with new `startedAt` and `finishedAt` values on each run, and the aggregate binds `applicationRollbackSha256`. A temporary exact-head variant changed only those timestamps on replay and reproduced `ROLLBACK_CLEANUP_REPLAY_CONFLICT` at `rollback-cleanup.ts:2142`.

The crash window is worse: `rollback-cleanup.json` is written before scope lifecycles are finalized. If the process dies there after successful production deletion, retry sees production still `QUIESCING`, cannot reconstruct the database proof, changes the prior PASS result to FAIL, and conflicts with the immutable aggregate. Terminal evidence can remain absent.

Required remediation: resolve and reuse existing aggregate/terminal authority before rerunning volatile application rollback or consumed cleanup proof. Add changed-timestamp replay and crash-injection-after-aggregate coverage, requiring no second side effect, unchanged aggregate bytes, both correct lifecycle states, and terminal `ROLLBACK_FAILED`.

### PRR-004 — Cleanup failure is discarded when selecting the attempt terminal state (`S2`)

The active rollback oracle returns the authoritative terminal reason/digest but projects only `applicationRollback`. The controller chooses `ROLLED_BACK|ROLLBACK_FAILED` solely from that application status. Therefore application `PASS|NOT_APPLICABLE` plus any cleanup `FAIL` writes terminal evidence `ROLLBACK_FAILED` but journals the deployment attempt as `ROLLED_BACK`.

A temporary exact-head controller regression reproduced `ROLLED_BACK` where `ROLLBACK_FAILED` was required. Fresh-context review independently confirmed the production control flow.

Required remediation: propagate and verify authoritative terminal state through the oracle/controller contract, then add full-controller mixed-failure coverage bound to the terminal evidence digest.

## Validation

- `npm run format:check`, `npm run lint`, and `git diff --check`: PASS.
- `npm run typecheck:lp05` after building `@idea/contracts`: PASS.
- `npm run test:deployment:unit`: 7 files / 89 tests PASS.
- `npm run test:deployment:authority`: 16 tests PASS.
- `npm run test:deployment:restore-chain`: 27 tests PASS.
- Static release readiness: `LP05_RELEASE_READINESS_PASS`.
- Review-only changed-timestamp replay: reproduced PRR-003.
- Review-only controller terminal-state regression: reproduced PRR-004.
- Fresh-context independent review: confirmed both blockers.
- GitHub Actions run `30901669528`: `verify` job `91967165532` and `lp05-candidate` job `91967771827` both succeeded for the exact head.
- PR snapshot: OPEN, non-draft, MERGEABLE/CLEAN, exact base and head unchanged at observation time.

## Boundary

No production host, DNS, public endpoint, real secret, deployment, merge, release, or publication was touched. Engineering Review remains review-only.
