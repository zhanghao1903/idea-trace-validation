# PR #7 Engineering Review — Cycle 1

- Repository: `zhanghao1903/idea-trace-validation`
- Pull request: <https://github.com/zhanghao1903/idea-trace-validation/pull/7>
- Base: `codex/v0-1-project-plan` at `46e021d261fd8a663c83430a551f5674365ccf14`
- Reviewed head: `codex/lp-05-deployment-release` at `8dc99e295b9021f6123c027092b4f57600cc964f`
- Reviewed at: `2026-08-02T20:02:50Z`
- Decision: **REQUEST_CHANGES**
- Merge status: **NOT_READY** (`review-only`; Review did not merge)

## Outcome

The pinned application candidate, hardened Compose/Caddy topology and exact-head GitHub jobs are healthy. Three
trust-boundary defects still block production authorization and merge:

1. the smoke CLI converts a caller-written observation file into external `PASS` without making the claimed
   HTTPS/network/story observations;
2. the attempt journal accepts `DEPLOYED` while migration, smoke, backup and restore evidence are all `null`;
3. the restore command does not bind its actual `PGHOST/PGPORT/PGDATABASE` destination to the declared isolated
   target.

These are executable counterexamples, not documentation-only gaps. The current green CI suite does not exercise
them.

## Blocking findings

### PRR-001 — External smoke PASS is minted from caller assertions (S1)

Location: `scripts/lp05/smoke/run.ts:24-57`

`deploy:lp05:smoke` reads JSON, verifies only the assertion-ID set and unconditionally sets `status: PASS`. It never
invokes the HTTP, certificate/header, network or LP-04 journey observers added elsewhere. The evidence parser also
does not require certificate hostname equality or validity at `observedAt`.

Reviewer reproduced this at the exact head with `origin=https://demo.example.com/`, certificate hostname
`wrong.example.net`, a certificate expired in 2020 and 22 `CALLER_ASSERTED` rows. The CLI emitted a canonical
`EXTERNAL_INITIAL` PASS with smoke digest
`4540f85cb049779da964d52d1f9e0e722f3834a109f82afecc083b5b8d032588` without any network request.

Required action: actively derive production smoke evidence from the exact authorized live origin/runtime. Keep
observation import typed as `LOCAL`/`TEST_FIXTURE`, validate certificate hostname and time, and add forged,
expired/wrong-host and skipped-observation negatives.

### PRR-002 — Attempt journal accepts DEPLOYED without required evidence (S1)

Location: `scripts/lp05/deploy/attempt-state.ts:28-73`

State projection checks only transition-chain shape and that `sourceDatabase` is non-null from safety resolution.
It does not parse that database identity or require state-specific migration, smoke, backup, restore and
production-unchanged evidence. Controller oracles return arbitrary digest/projection pairs, and the controller
appends `DEPLOYED` without final cross-record equality. Its failure path also does not disable ingress or call the
rollback implementation.

Reviewer advanced a valid attempt through the complete legal state sequence with `sourceDatabase={}` and
`migration`, `initialSmoke`, `postDeployBackup`, `restoreEvidence` and `postRestoreSmoke` all `null`;
`finalizeAttemptRecord` accepted `currentState=DEPLOYED`. The planned `deploy:lp05` and
`deploy:lp05:rollback` entrypoints and full controller/fault tests are also absent.

Required action: ship the executable controller/rollback surface and make each transition validate its closed,
exactly bound evidence. Enforce the single-target/single-attempt lock, bounded resume, ingress-disable/rollback
failure behavior and full equality before `DEPLOYED`; cover fresh, upgrade and every fault boundary.

### PRR-003 — pg_restore destination is not bound to the isolated target (S1)

Location: `scripts/lp05/database/restore.ts:27-58`

The mutation guard compares caller-provided `isolatedTarget` and `productionIdentity` metadata, then only requires
`PGHOST` to be loopback. `PGPORT` and `PGDATABASE` are independent environment values and are never matched to the
declared isolated origin/database. `pg_restore` therefore writes to whichever loopback database the environment
selects, including a production instance exposed on loopback, while the request can describe unrelated safe
metadata.

Required action: generate the connection from one validated isolated-target record or require exact host, port,
database, compose project/container/volume labels and live system identity equality immediately before spawn. Add
tests proving every destination mismatch fails before `age` or `pg_restore` starts.

## Validation

- GitHub PR: OPEN, non-Draft, `CLEAN/MERGEABLE`, exact requested base/head.
- GitHub Actions run `30763934769`: `verify` job `91539241856` and `lp05-candidate` job `91539476979` both PASS on
  the exact head.
- `npm run test:deployment:unit`: 5 files, 31/31 tests PASS.
- `npm run typecheck`: PASS.
- `npm run deploy:lp05:validate`: `LP05_RELEASE_READINESS_PASS`.
- Full PR `git diff --check`: PASS.
- Reviewer external-smoke forgery: reproduced (blocking failure).
- Reviewer missing-evidence `DEPLOYED` transition: reproduced (blocking failure).

The machine-readable result is `pr-review-7-8dc99e295b90.json`.
