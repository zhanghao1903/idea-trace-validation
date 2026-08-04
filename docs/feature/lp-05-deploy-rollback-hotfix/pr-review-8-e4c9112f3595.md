# PR Review: #8 at `e4c9112f3595`

- Decision: **REQUEST_CHANGES**
- Review mode: read-only
- Base: `codex/v0-1-project-plan` at `99734e8e6c456e0366d28ce7d9a731b3544f0a56`
- Head: `codex/lp-05-deploy-rollback-hotfix` at `e4c9112f35957dd22452c89ef9e522057e81f9ff`
- Reviewed at: `2026-08-04T08:52:52Z`

## Outcome

Cycle 3 resolves PRR-001. When the process dies after the exact restore deletion but before forward evidence is written, the current code now requires RESTORE `QUIESCING`, a nonempty frozen set and consecutive empty observations, derives the same removal digest, issues no second delete, and lets the actual rollback reach `ROLLED_BACK`. The 80-test LP-05 suite, static validator and both exact-head GitHub checks pass.

Approval is still withheld for one induced S2 blocker. The recovery is implemented inside `cleanupOwnedProject`, while actual rollback calls that helper directly. It therefore never checks whether `forward-restore-cleanup.json` already exists and bypasses the forward resolver's parse, digest and binding checks.

## Blocking finding

### PRR-002 — Rollback recovery ignores existing contradictory forward evidence (`S2`)

Two independent exact-head counterexamples created the legitimate `QUIESCING + empty project` crash state, then wrote a structurally and digest-valid forward record bound to a different restore project before calling `executeRollbackWithCleanup`. The design says conflicting evidence must fail closed. Instead, the new lifecycle-only branch reconstructed `PASS`, wrote a PASS rollback aggregate and returned terminal `ROLLED_BACK`.

The committed Cycle 3 regression explicitly asserts `ENOENT` for the forward file. It proves the missing-evidence case but does not distinguish it from valid matching, malformed, or digest-valid wrong-bound evidence.

Required remediation:

- Use lifecycle-only recovery only when the fixed forward-evidence path is absent.
- If the path is present, parse and resolve it against the exact attempt, project, database and QUIESCING authority; reuse the exact persisted result if valid.
- Fail closed for malformed, wrong-bound or conflicting content before a PASS aggregate or terminal `ROLLED_BACK` can be written.
- Exercise absent, valid matching, malformed and digest-valid conflicting evidence through the actual rollback path, including side-effect count and order.

## Validation

- `npm run format:check`, `npm run lint`, and remediation `git diff --check`: PASS.
- `npm run typecheck:lp05` after building `@idea/contracts`: PASS.
- `npm run test:deployment:unit`: 7 files / 80 tests PASS.
- `npm run test:deployment:authority`: 16 tests PASS.
- `npm run test:deployment:restore-chain`: 27 tests PASS.
- Static release readiness: `LP05_RELEASE_READINESS_PASS`.
- Review-only contradictory-forward-evidence regression: FAIL as expected for PRR-002; rollback resolved `ROLLED_BACK` instead of rejecting. The temporary test was removed and the worktree returned to the exact routed feature snapshot before report creation.
- Fresh-context independent regression: the same direct-rollback bypass was reproduced independently.
- GitHub Actions run `30892031435`: `verify` job `91936108628` and `lp05-candidate` job `91936713305` both succeeded for the exact head.

## Boundary

No production host, DNS, public endpoint, real secret, deployment, merge, release, or publication was touched. Engineering Review remains review-only.
