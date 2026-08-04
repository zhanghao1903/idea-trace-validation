# Implementation Plan: LP-05 production deployment rollback hotfix

- Feature directory: `docs/feature/lp-05-deploy-rollback-hotfix/`
- Branch: `codex/lp-05-deploy-rollback-hotfix`
- Requirements: `requirements.md` at `e2d9b0a30e1e98b227b13ca7fd5c59d46e618b0a`
- Design: `design.md`
- Current phase: F3 / technical-plan review preparation

## Scope

### In scope

- Explicit configured PostgreSQL principal for both production identity paths.
- Project/environment/role plus attempt/target/candidate labels and pre-mutation production/restore lifecycles.
- Strict, independently persisted rollback cleanup evidence and fresh-install cleanup.
- Targeted unit/contract/real-Docker regressions plus LP-05 operator documentation and changelog.
- After merge only: rebuild a new immutable candidate and prepare a new proposal; do not deploy it.

### Out of scope

- Product API/schema/Web/Skill changes, upgrade rollback redesign, general Docker cleanup, production access,
  server patching, release authorization, deployment, publication, or history rewriting.

## Implementation slices

| Slice | Files/modules | Behavior | Tests | Docs / rollback |
| --- | --- | --- | --- | --- |
| S1 configured principal | `scripts/lp05/database/production-runtime.ts`; call sites in `host-active-operations.ts`; `database.unit.test.ts` | Add required `databaseUser`; both identity commands pass exact `--username` and `--dbname`; ambient `PGUSER` cannot select the role | command-shape tests; wrong-user/no-fallback tests; real PostgreSQL 17.10 proof | Internal signature only; revert commit restores prior code but blocks release |
| S2 ownership and lifecycle | `deploy/compose.production.yaml`; `deploy/compose.restore.yaml`; `scripts/lp05/deploy/compose.ts`; new `rollback-cleanup.ts`; `host-active-operations.ts` | Label production/restore containers, networks and volumes; implement the closed V1/V2 lifecycle, observation, policy, reference, cleanup and terminal-envelope contracts | static render; every state/variant/exact-key/binding/replay case; historical RestoreLifecycleV1 read-only | Document paths/V1 compatibility; no migration |
| S3 rollback separation | `active-oracles.ts`; `host-active-operations.ts`; `controller.ts`; `attempt-record.ts` tests | Return strict application rollback separately from cleanup reference; project only existing rollback fields; propagate the verified terminal state and bind its digest into transition evidence | regression for prior `restoreCleanup` extra-key failure; successful `NOT_APPLICABLE` + cleanup PASS -> `ROLLED_BACK`; any cleanup FAIL -> `ROLLBACK_FAILED`, including a non-failing application branch | Preserve seven-field rollback schema and attempt state graph |
| S4 identity-safe cleanup | `rollback-cleanup.ts`; `host-active-operations.ts`; `host-rollback.ts` only for ingress integration | Recount rows; freeze/reverify complete identities; remove only container IDs, just-in-time reverified volume names and network IDs; fixed quiescence; no broad Compose down | no-data, foreign/missing binding, set drift, late orphan, same-name replacement, partial cleanup, reappearance, no-resource | Fail closed; manual handling remains explicit |
| S5 real Docker acceptance | new `scripts/lp05/deploy/hotfix-docker.acceptance.ts`; `package.json`; CI entry if needed | Unique production/restore projects and temp roots; no `postgres` role; real identity readers; injected post-Postgres failure/recovery; restore V2 cleanup | `npm run test:deployment:hotfix`; both projects zero all three resource classes; production/restore late sentinels remain | Refuse production names/domain/root |
| S6 docs and release record | hotfix verification/implementation notes; `docs/feature/lp-05-deployment-release/evidence-schema.md`; operator/release docs; `CHANGELOG.md` | Explain sole configured DB principal, cleanup preconditions, evidence authority, manual fallback, retired proposal, new-candidate requirement | links and examples checked by format/lint/static verification | Changelog `Fixed`; no tag/release/package |

## Detailed contracts to implement

1. `inspectLiveProductionDatabaseIdentity` and `inspectLiveProductionIdentity` require `databaseUser` and pass it as
   a discrete Docker exec argument after `--username`. All runtime call sites use `loadDeploymentConfig(...).postgresUser`.
2. Fixed keys `IDEA_VALIDATION_ATTEMPT_ID`, `IDEA_VALIDATION_TARGET_ID`, and
   `IDEA_VALIDATION_CANDIDATE_MANIFEST_SHA256` are overwritten from parsed authority. Static validation requires the
   project/environment/role and authority labels on every production and restore service, network, and named volume.
3. Implement the exact `DockerResourceIdentityV1`, `DockerResourceObservationV1`, `CleanupPolicyV1`,
   `ProductionLifecycleV1`, `RestoreLifecycleV2`, `CleanupResultV1`, `RollbackCleanupEvidenceV1`,
   `CleanupReferenceV1`, and `TerminalRollbackEvidenceV1` contracts and state invariants from Design §§5-6.
4. `DeploymentAttemptV1.rollback` remains exactly seven fields. The terminal envelope projects only application
   rollback; its independently recomputable digest is the terminal transition evidence.
5. Fresh production cleanup requires null previous release; restore cleanup requires V2 authority. Both paths freeze
   and reverify resource sets and delete only exact identities. The fixed 3 × 250 ms, maximum 15 samples/30 seconds
   policy proves quiescence.
6. RestoreLifecycleV1 remains read-only for old attempts and cannot authorize new cleanup. No historical record is
   migrated, rewritten, re-signed, or replaced.

## Package and ownership boundaries

- `scripts/lp05/database`: live database identity and read-only row-count facts.
- `scripts/lp05/deploy`: attempt-scoped labels, lifecycle persistence, rollback coordination, resource cleanup.
- `deploy/compose.production.yaml` and `deploy/compose.restore.yaml`: declarative non-secret authority labels only.
- `apps/**`, `packages/db` business migrations/schema, Web, OpenAPI, and `skills/**`: unchanged.

## Verification

### Targeted automated checks

```bash
npm run typecheck:lp05
npm run test:deployment:unit
npm run test:deployment:authority
npm run test:deployment:restore-chain
npm run deploy:lp05:validate
npm run test:deployment:hotfix
```

The new Docker acceptance must prove:

- PostgreSQL image `17.10` starts with `POSTGRES_USER=idea_validation` and no `postgres` role;
- both identity readers succeed with the configured role and return the same system/database/version identity;
- a deterministic next-phase failure invokes real recovery;
- the strict application rollback is `NOT_APPLICABLE`, cleanup evidence is independently valid, and attempt terminal
  state is `ROLLED_BACK`;
- final production and restore container/network/volume counts are zero and every foreign sentinel is unchanged.

### Negative checks

- Wrong configured role fails before trusted identity and never retries another role.
- Missing/foreign attempt, target, candidate, compose-project, environment, or role labels on production or restore
  containers/networks/volumes block cleanup.
- Nonzero application rows block cleanup.
- Extra or missing fields, wrong canonical digest, wrong authority binding, and false empty observations are rejected.
- Partial cleanup or resource reappearance cannot produce `CLEANED` or `ROLLED_BACK`.
- A same-project foreign/orphan introduced after the frozen observation remains present, is never a delete argument,
  and forces FAIL. A same-name replacement volume fails just-in-time identity equality and remains untouched.
- Cleanup reference resolution and terminal-envelope digest are independently recomputable; wrong path/status/SHA,
  lifecycle binding, or application rollback digest is rejected.
- Injecting `restoreCleanup` into `attempt.rollback` continues to raise `ATTEMPT_ROLLBACK`/field validation failure.

### Full repository gate

```bash
npm run verify
git diff --check
```

Docker-backed proof is mandatory and cannot be replaced with mocks. If the local machine lacks Docker, the exact
test must run in GitHub Actions before code review can pass; both the command and authoritative run URL are recorded.

## Documentation and evidence updates

- Add an implementation/verification note in this feature directory with exact commands, results, and any skipped
  local proof.
- Update `docs/feature/lp-05-deployment-release/evidence-schema.md` with all additive closed records,
  RestoreLifecycle V1/V2 compatibility, fixed policy, label chain, resolver, and terminal envelope.
- Update the narrow operator/release documentation that describes database principal and manual handling on
  ambiguous cleanup.
- Add a `Fixed` entry under `CHANGELOG.md` `Unreleased`.
- Never commit credentials, age identities, raw production logs, local Docker volumes, or failed-attempt private files.

## Phase commit and push plan

1. Plan commit: requirements + `design.md` + `implementation-plan.md`; push and dispatch exact plan review.
2. After exact plan PASS and Goal activation, one or more implementation commits for S1-S6, each scoped and tested.
3. Verification/PR commit records exact checks, changelog, and PR summary; push exact head for Review.
4. Main does not approve or merge. External merge ownership remains unchanged.
5. After authoritative merge proof, rebuild the candidate and prepare a new proposal only. Production deployment
   still requires a separate explicit authorization bound to that new proposal.

## Rollout and rollback

- Rollout: merge the reviewed code; do not touch production. Build a new candidate from the merge commit and generate
  a new proposal SHA through existing LP-05 gates.
- Code rollback: revert the hotfix commit before any new deployment if verification regresses. Never reactivate the
  retired proposal.
- Runtime failure after a later separately authorized deployment: preserve the new attempt evidence; automatic
  cleanup applies only under the exact fresh-install proof. Otherwise stop for manual recovery.
- Compatibility: existing attempts and records remain valid; the new cleanup record is additive and absent for old
  attempts.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Compose reuses a foreign volume/network | Require zero pre-inventory, V1/V2 lifecycle, exact labels and frozen identity before any delete |
| Cleanup sees a late foreign/orphan/replacement | No broad delete; reverify the set, delete only frozen identities and fail on nonzero post-observation |
| Application-row count is incomplete | Enumerate all application-owned public tables with quoted identifiers; exclude only the two migration ledgers; fail on query/parse ambiguity |
| Cleanup evidence weakens strict attempt schema | Keep it out of `attempt.rollback`; closed independent record plus digest reference only |
| Real Docker test accidentally targets production | Unique generated project, temporary roots, loopback/no public app start, exact cleanup trap, production-name refusal |

## Open decisions

None. Implementation must return to Requirements if it needs broader deletion authority, a public contract change,
production access, historical mutation, or release/deployment authorization.
