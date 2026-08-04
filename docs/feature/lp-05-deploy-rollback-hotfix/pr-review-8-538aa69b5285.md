# PR Review — LP-05 deployment rollback hotfix (Cycle 10)

## Decision

**REQUEST_CHANGES**

Reviewed exact PR #8 snapshot:

- Base: `99734e8e6c456e0366d28ce7d9a731b3544f0a56`
- Head: `538aa69b52858517f56dd10c0803d952d7811a9d`
- Review mode: read-only
- GitHub state: OPEN, non-Draft, MERGEABLE/CLEAN
- Exact-head checks: `ci / verify` PASS; `ci / lp05-candidate` PASS

Cycle 10 closes PRR-007 and the original PRR-008 trigger. The database principal is durably bound before mutation, and nonterminal manual recovery now routes through the shared cleanup aggregate and terminal authority. Approval remains unsafe because two defects remain in that same documented recovery entrypoint.

## Blocking findings

### PRR-009 — S2 — Manual recovery becomes permanently unreachable after envelope expiry

`executeManualRollback` calls `verifyDeploymentAuthorizationEnvelope(request.envelope, now())` before it reads the persisted attempt. The authorization envelope is limited to 24 hours and throws `AUTH_EXPIRED` at `expiresAt`. Later checks require the exact original envelope ID/SHA, so a replacement authorization cannot recover the persisted attempt.

A review-only timestamp probe changed the existing aggregate-crash fixture to recover after expiry. It failed with `AUTH_EXPIRED` before any aggregate recovery. This conflicts with the runbook's documented idempotent recovery of an exact persisted `FAILED`/`ROLLING_BACK` attempt; controller recovery already distinguishes immutable envelope verification from forward-time authorization.

Required remediation:

1. For persisted recovery, verify the exact envelope identity/digest and attempt binding without reusing forward execution expiry as a permanent recovery veto.
2. Keep mismatched envelope and all cleanup/terminal authority checks fail-closed.
3. Add expired-envelope `FAILED` and `ROLLING_BACK` CLI regressions.

### PRR-010 — S2 — Already-terminal manual replay skips promised live reconciliation

The `ROLLED_BACK|ROLLBACK_FAILED` branch calls `resolvePersistedTerminalRollbackEvidence` with only `attempt` and `evidenceRoot`. That resolver rereads persisted aggregate/reference/terminal JSON but has no Docker runner or environment and cannot reconcile live resources.

A temporary assertion on the committed terminal replay fixture showed zero additional Docker calls (`18` before, `18` after). If an exact-attempt-owned production or restore resource reappears after terminalization, the documented command returns historical `ROLLED_BACK` without observing it. This contradicts the accepted design and operations guide, both of which promise live reconciliation before terminal replay returns.

Required remediation:

1. Run the same non-mutating persisted-aggregate live reconciliation before returning an already-terminal attempt.
2. Do not repeat application rollback or deletion.
3. Add terminal production/restore reappearance and preserved-upgrade drift regressions requiring observation and rejection.

## Prior finding disposition

| Finding | Current | Evidence |
| --- | --- | --- |
| PRR-007 | resolved | RuntimeBindingV2 persists the validated principal and rejects restart drift before effects |
| PRR-008 | resolved for original trigger | Nonterminal CLI recovery now uses shared aggregate/reconciliation/terminal authority |
| PRR-006 | resolved | Production scope remains bound to immutable attempt target |
| PRR-005 | resolved | Pre-terminal aggregate replay still reconciles live scope state |
| PRR-004 | resolved | Verified terminal state/digest still drives controller journaling |
| PRR-003 | resolved | Aggregate replay retains compatible scope references and bytes |
| PRR-002 | resolved | Pending/terminal restore authority remains preflighted before effects |
| PRR-001 | resolved | Deletion-before-evidence recovery uses frozen authority without a second delete |

## Validation

| Check | Result |
| --- | --- |
| Offline dependency install + build | PASS — 364 packages; workspace/web build complete |
| `typecheck:lp05`, `format:check`, `lint`, `git diff --check` | PASS |
| `test:deployment:unit` | PASS — 8 files, 97 tests |
| `test:deployment:authority` | PASS — 16 tests |
| `test:deployment:restore-chain` | PASS — 27 tests |
| Static release readiness | PASS — `LP05_RELEASE_READINESS_PASS` |
| GitHub `ci / verify` | PASS — run 30919976496, job 92027721753 |
| GitHub `ci / lp05-candidate` | PASS — run 30919976496, job 92028559670 |
| Expired-envelope recovery probe | FAIL — `AUTH_EXPIRED` (PRR-009) |
| Terminal replay live-observation probe | FAIL — zero additional Docker calls (PRR-010) |
| Mandatory fresh-context pass | FAIL — independently confirmed both blockers |

## Scope and limitations

The review reconciled all 15 Cycle 10 delta files and the complete effective PR. No production host, DNS, public endpoint, real secret, production database, merge, publication, or feature-branch mutation was performed. Temporary probe edits were removed; all implementation paths equal the exact routed head. Only immutable review reports are retained.
