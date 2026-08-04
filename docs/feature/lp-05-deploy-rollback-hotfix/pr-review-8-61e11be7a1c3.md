# PR Review — LP-05 deployment rollback hotfix (Cycle 9)

## Decision

**REQUEST_CHANGES**

Reviewed exact PR #8 snapshot:

- Base: `99734e8e6c456e0366d28ce7d9a731b3544f0a56`
- Head: `61e11be7a1c356053511ab5ac3e15ba66c03fd95`
- Review mode: read-only
- GitHub state at review: OPEN, non-Draft, MERGEABLE/CLEAN
- Exact-head checks: `ci / verify` PASS; `ci / lp05-candidate` PASS

Cycle 9 correctly resolves PRR-006 by deriving the production Compose project from the immutable attempt target and rejecting mismatched execution or aggregate authority before callbacks and Docker reads. Approval is still unsafe: one S1 data-loss path and one S2 terminal-authority bypass remain.

## Blocking findings

### PRR-007 — S1 — Mutable database principal can bypass the data guard and delete production data

**Location:** `scripts/lp05/deploy/host-active-operations.ts:1428-1437`; destructive use at `scripts/lp05/deploy/rollback-cleanup.ts:1564-1614`

The host now binds `productionProject`, but it still reloads `POSTGRES_USER` and `POSTGRES_DB` from the recovery process environment. The durable `AttemptRuntimeBindingV1` does not contain that production principal. Cleanup queries the supplied database and treats a zero count as authority to delete the target project's frozen container, network, and volume.

An exact-head adversarial probe modeled one application row in the originally deployed database and an existing empty decoy database selected on restart. Recovery queried only the decoy, resolved `terminalState=ROLLED_BACK`, and removed all container/network/volume resources. The mandatory fresh-context reviewer independently reproduced the same result:

```json
{"actualDatabaseRows":1,"queriedDatabases":["decoy_empty_db"],"terminalState":"ROLLED_BACK","remaining":{"containers":0,"networks":0,"volumes":0}}
```

This violates the feature's central rule that automatic deletion requires proof that the actual production application database is empty and must not rely on ambient environment.

Required remediation:

1. Durably bind the non-secret production database user and name before the first mutation.
2. Derive every recovery cleanup query from that immutable authority.
3. Reject current-config drift before application callbacks, database reads, or Docker mutation.
4. Add a crash/restart regression with data in the bound database and an empty current-config database; require no decoy query, deletion, or terminal success.

### PRR-008 — S2 — The documented manual rollback entrypoint bypasses cleanup and terminal authority

**Location:** `scripts/lp05/deploy/rollback-cli.ts:104-132`

`npm run deploy:lp05:rollback` is documented at `docs/operations/lp05.md:292-296` as the idempotent recovery command for persisted `FAILED`/`ROLLING_BACK` attempts. Its implementation calls only `rollbackApplication` and maps application `PASS|NOT_APPLICABLE` directly to `ROLLED_BACK`.

Unlike controller recovery, the command never executes or resolves `rollback-cleanup.json`, never reconciles production/restore cleanup, and never verifies `TerminalRollbackEvidenceV1`. A fresh-install application rollback is normally `NOT_APPLICABLE`, so the command can journal `ROLLED_BACK` while exact attempt-owned resources remain. If a crash occurred after aggregate persistence, it can also repeat application rollback instead of replaying immutable authority.

Required remediation:

1. Route the CLI through the same persisted runtime, cleanup aggregate, reconciliation, and terminal-evidence path as controller recovery, or refuse terminal success without verified exact-attempt terminal cleanup authority.
2. Add CLI-level fresh-install and aggregate-persisted crash tests requiring one application invocation, no repeated deletion, and no `ROLLED_BACK` without resolved aggregate PASS.

## Prior finding disposition

| Finding | Previous | Current | Evidence |
| --- | --- | --- | --- |
| PRR-006 | open | resolved | Target-derived host caller; entry and aggregate mismatch gates; committed lifecycle-null project-drift regression |
| PRR-005 | resolved | resolved | Persisted production/restore scopes remain re-observed; reappearance and upgrade-set drift regressions pass |
| PRR-004 | resolved | resolved | Active oracle returns verified terminal state and controller journals it |
| PRR-003 | resolved | resolved | Aggregate recovery precedes callbacks/mutations and preserves one application invocation |
| PRR-002 | resolved | resolved | Forward/terminal restore authority remains preflighted before new effects |
| PRR-001 | resolved | resolved | Exact QUIESCING restore replay retains frozen authority without another delete |

## Validation

| Check | Result |
| --- | --- |
| Offline locked dependency install | PASS — 364 packages |
| Contracts build + `typecheck:lp05` | PASS |
| `format:check`, `lint`, `git diff --check` | PASS |
| `test:deployment:unit` | PASS — 7 files, 95 tests |
| `test:deployment:authority` | PASS — 16 tests |
| `test:deployment:restore-chain` | PASS — 27 tests |
| Static release readiness | PASS — `LP05_RELEASE_READINESS_PASS` |
| GitHub `ci / verify` | PASS — run 30912892778, job 92003716867 |
| GitHub `ci / lp05-candidate` | PASS — run 30912892778, job 92004456673 |
| Production-principal drift adversarial probe | FAIL — PRR-007 reproduced |
| Mandatory fresh-context independent pass | FAIL — PRR-007 reproduced; PRR-008 confirmed |

The first parallel authority-test attempt raced the contracts build and failed to resolve `@idea/contracts`; after the build completed, the unchanged authority and restore-chain commands were rerun independently and passed. This was a review orchestration race, not a code failure.

## Scope and limitations

Review inspected the complete Cycle 8-to-9 delta and reconciled the full 28-file effective PR. No production host, DNS, public endpoint, real secret, production database, merge, publication, or feature-branch mutation was performed. Temporary adversarial tests were removed; the exact tracked test blob equals HEAD. Only immutable review-record files are retained.

A caller-level host regression for ambient Compose-project drift is recommended as defense in depth, but it does not replace the two blocking actions above.
