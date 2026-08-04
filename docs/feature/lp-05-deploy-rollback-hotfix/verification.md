# LP-05 production deployment rollback hotfix verification

- Feature: `lp-05-deploy-rollback-hotfix-4b7e2c9a6d10`
- Confirmed requirements: `e2d9b0a30e1e98b227b13ca7fd5c59d46e618b0a`
- Approved plan: `1c84dd398ed6b44f81682986be7df28ea55b749d`
- Approved composite digest: `10f03ecf7ff759177fdbd5103fb5c81c2812d3385e46c7e279ea4080dd62c4b6c`
- Cycle 1 review result: `2acd176f55e096e571ca7601e1c3af01421e3460195dd270d84737dba0b86bd6`
- Cycle 1 immutable report: `19d4087f89c9f0ee8c0808d9619e21768887711d`
- Cycle 2 review result: `8d7d3206070ea3da3cc9c6eb79b3dc794a94de0d669bd870c686e4d9824c6aa9`
- Cycle 3 review result: `e27a758879166520009776b3950ee7ec6a90d297aaf714d811dd3346628f2791`
- Cycle 4 review result: `236e87ba06125e4c73c5c3b8091e7a99286f57a4b5a7f146e762c1614af6ed19`
- Cycle 4 immutable report: `f96e0228db082c30e7d24e2a5d1653298aa5197a`
- Cycle 5 review result: `85cb6601b8cd1874928b6591c039f8bf85d0b2ae278c67900bf53a46188a98a4`
- Cycle 5 immutable report: `d423c3bfc697861f71940a3337643f612139e0ea`
- Scope: repository implementation and local/CI verification only
- Production deployment: `NOT RUN`

## Implemented behavior

- Both live production database readers pass the validated `POSTGRES_USER` and `POSTGRES_DB` as explicit PostgreSQL
  arguments; no ambient/default role fallback is accepted.
- Production and isolated-restore services, networks and named volumes carry closed attempt/target/candidate authority
  labels. Production V1 and restore V2 lifecycle files are persisted before mutation.
- The existing seven-field application rollback object remains closed. Cleanup authority is stored separately in an
  attempt-relative, digest-resolved rollback-cleanup record; terminal rollback evidence binds both records without
  adding a field to `DeploymentAttemptV1.rollback`.
- Normal forward restore cleanup persists its own immutable attempt-local authority, transitions the exact V2
  lifecycle from `QUIESCING` to `CLEANED` before PASS, and lets a later phase failure reuse the terminal proof without
  a second deletion or `ROLLBACK_FAILED`.
- Fresh-install cleanup proves null previous release, configured-principal application row count zero, exact complete
  Docker identities, stable frozen sets and consecutive empty observations. Containers/networks are removed by
  immutable ID and volumes by exact name after just-in-time identity equality. Upgrade, foreign and ambiguous
  resources are preserved.
- The Docker-backed acceptance uses unique temporary project names, a pinned PostgreSQL 17.10 image and a configured
  database role with no `postgres` database role. A real controller phase succeeds, the next phase fails
  deterministically, and controller recovery reaches `ROLLED_BACK` only after both project resource classes are zero
  while foreign sentinels remain inspectable.

## Verification commands

The implementation worktree produced these results for the initial snapshot and the Cycle 1 remediation:

```text
npm run format:check
npm run lint
npm run typecheck:lp05
npm run test:deployment:unit
npm run test:deployment:authority
npm run test:deployment:restore-chain
npm run deploy:lp05:validate
npm run test:deployment:hotfix
npm run verify
git diff --check
```

| Gate | Result |
| --- | --- |
| formatting, lint, Skill/generated contracts, TypeScript and build | PASS |
| repository unit/contract/integration/Web/acceptance suites | PASS: 144 + 23 + 31 + 8 + 13 tests |
| `npm run test:deployment:unit` | PASS: 7 files, 89 tests |
| `npm run test:deployment:authority` | PASS: 16 tests |
| `npm run test:deployment:restore-chain` | PASS: 27 tests |
| `npm run deploy:lp05:validate` | PASS: `LP05_RELEASE_READINESS_PASS` |
| `npm run test:deployment:hotfix` | PASS: `LP05_HOTFIX_DOCKER_ACCEPTANCE_PASS` |
| browser and LP-04 browser suites | PASS: 7 + 1 tests |
| `npm run verify` | PASS |
| `git diff --check` | PASS |

`npm run test:deployment:hotfix` is a mandatory real-Docker gate. It refuses the production Compose project name,
uses temporary roots, creates only nonce-prefixed projects and has an exact cleanup trap. The test produces local
fixture evidence only; it grants no deployment authority.

## Cycle 1 code-review remediation

PRR-001 identified that successful forward restore cleanup deleted the exact resources but left
`RestoreLifecycleV2` in `QUIESCING`. The remediation adds a closed, digest-bound
`forward-restore-cleanup.json` record and fixed-path reference, persists `CLEANED` before returning PASS, and makes
later rollback resolve the terminal result while proving the project remains empty. A focused unit regression proves
both crash-window recovery and later rollback without a second delete or `ROLLBACK_FAILED`; the real Docker gate
also executes the forward cleanup before controller rollback and reaches `ROLLED_BACK` with no project resources.

## Cycle 2 code-review remediation

Cycle 2 found the adjacent earlier crash window in which the frozen RESTORE set had been deleted but
`forward-restore-cleanup.json` did not yet exist. Recovery now accepts only an exact V2 `QUIESCING` authority with a
nonempty frozen set and a currently empty exact project, re-runs the fixed consecutive-empty oracle, derives the
removal digest from the frozen authority and issues no second delete. The focused regression enters the actual
`executeRollbackWithCleanup` path from that state and requires a resolvable PASS rollback authority,
`ROLLED_BACK`, a terminal `CLEANED` restore lifecycle and zero second-delete calls. The real-Docker hotfix gate now
also separates deletion from forward evidence persistence before resuming the wrapper. Partial deletion, authority
drift, and production cleanup remain fail-closed.

## Cycle 3 code-review remediation

Cycle 3 closed PRR-001 and identified PRR-002: the actual rollback path could bypass an existing contradictory
forward record because it called lifecycle-only cleanup directly. Rollback now preflights the fixed forward path
before application rollback or any production/restore deletion. The actual rollback regression matrix covers all four authority states:
absent evidence recovers from exact `QUIESCING`; valid matching evidence is resolved and reused; malformed evidence
is rejected; and digest-valid wrong-project evidence is rejected. Both rejection cases assert no application rollback, no new Docker delete,
no rollback aggregate, no terminal evidence and an unchanged `QUIESCING` lifecycle. The matching case requires
`ROLLED_BACK`, terminal `CLEANED`, the forward reference, and no second restore delete.

## Cycle 4 code-review remediation

Cycle 4 showed that the preflight still returned early for terminal RESTORE lifecycles, so corrupted lifecycle-bound
forward authority was rejected only after application rollback and production deletion. The terminal branch now
strictly resolves the lifecycle's own cleanup reference during the initial preflight, checks its previous-lifecycle
authority and terminal result, and re-observes an empty restore project for PASS. The existing valid terminal replay
regression remains green. Four new actual-rollback regressions replace terminal `CLEANED|CLEANUP_FAILED` evidence
with malformed and digest-valid wrong-project variants and require rejection with zero application rollback calls,
zero new Docker deletes, intact production resources, no rollback aggregate or terminal evidence, and the terminal
lifecycle left unchanged.

## Cycle 5 code-review remediation

Cycle 5 closed PRR-002 and exposed PRR-003: one aggregate FAIL reference could not simultaneously finalize a
successful production cleanup as `CLEANED` and a failed restore cleanup as `CLEANUP_FAILED`. The sole immutable
aggregate remains the terminal authority, while each non-not-applicable lifecycle now receives a closed
`ROLLBACK_CLEANUP_RESULT` reference to the same file and digest with status bound to its own result. Aggregate replay
retains the originally persisted timestamps and rejects any semantic change. New actual-rollback regressions require
production PASS/CLEANED plus restore FAIL/CLEANUP_FAILED, aggregate FAIL, terminal `ROLLBACK_FAILED`, and replay
without a second restore delete or aggregate conflict; the symmetric production FAIL plus restore PASS case must
also finalize both lifecycle states and terminal evidence.

## Release boundary

The previously authorized proposal
`3a6d65e723939cbac0ffebc80abcdc93d28362ada42f08fd34eca9af7bebd7b3` remains retired and must never be retried.
After this hotfix is reviewed and merged, a candidate must be rebuilt from the authoritative merge commit and a new
proposal must be separately authorized before any production operation. No credential, private key, production log,
Docker volume, failed-attempt file, tag, Release, package, registry image or marketplace asset is committed or
published by this feature.
