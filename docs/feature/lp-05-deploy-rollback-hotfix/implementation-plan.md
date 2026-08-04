# Implementation Plan: LP-05 production deployment rollback hotfix

- Feature directory: `docs/feature/lp-05-deploy-rollback-hotfix/`
- Branch: `codex/lp-05-deploy-rollback-hotfix`
- Requirements: `requirements.md` at `e2d9b0a30e1e98b227b13ca7fd5c59d46e618b0a`
- Design: `design.md`
- Current phase: F3 / technical-plan review preparation

## Scope

### In scope

- Explicit configured PostgreSQL principal for both production identity paths.
- Attempt/target/candidate labels and a pre-mutation production lifecycle for fresh resources.
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
| S2 ownership and lifecycle | `deploy/compose.production.yaml`; `scripts/lp05/deploy/compose.ts`; new `rollback-cleanup.ts`; `host-active-operations.ts` | Add authority labels to containers/networks/volumes; persist `CREATING` before fresh mutation; verify closed lifecycle/cleanup records and bindings | static Compose assertions; exact/foreign/missing-label cases; extra/missing field and digest tests | Document labels and evidence path; no old-record migration |
| S3 rollback separation | `active-oracles.ts`; `host-active-operations.ts`; `controller.ts` only if a narrow result type is required; `attempt-record.ts` tests | Return strict application rollback separately from cleanup reference; project only existing rollback fields; bind both digests into transition evidence | regression for prior `restoreCleanup` extra-key failure; successful `NOT_APPLICABLE` + cleanup PASS -> `ROLLED_BACK`; any cleanup FAIL -> `ROLLBACK_FAILED` | Preserve seven-field rollback schema and attempt state graph |
| S4 fresh-install cleanup | `rollback-cleanup.ts`; `host-active-operations.ts`; `host-rollback.ts` only for shared ingress stop integration | Recount app rows with configured principal; inspect complete exact-project resource set and authority labels; run Compose down only after proofs; require empty container/network/volume quiescence | no-data success; nonzero-data, foreign project/attempt/candidate, unlabelled, partial cleanup, resource reappearance, no-resource cases | Fail closed; manual handling reason remains explicit |
| S5 real Docker acceptance | new `scripts/lp05/deploy/hotfix-docker.acceptance.ts`; `package.json`; CI entry only if existing `verify` does not invoke the new script | Use unique local compose project and temporary secrets/evidence; prove no `postgres` role; run real identity readers; inject post-Postgres failure and drive real recovery | `npm run test:deployment:hotfix`; final exact project resources all zero; foreign sentinel remains | Never targets configured production project/domain/root |
| S6 docs and release record | hotfix verification/implementation notes; `docs/feature/lp-05-deployment-release/evidence-schema.md`; operator/release docs; `CHANGELOG.md` | Explain sole configured DB principal, cleanup preconditions, evidence authority, manual fallback, retired proposal, new-candidate requirement | links and examples checked by format/lint/static verification | Changelog `Fixed`; no tag/release/package |

## Detailed contracts to implement

1. `inspectLiveProductionDatabaseIdentity` and `inspectLiveProductionIdentity` require `databaseUser` and pass it as
   a discrete Docker exec argument after `--username`. All runtime call sites use `loadDeploymentConfig(...).postgresUser`.
2. An attempt-scoped environment, derived from parsed attempt authority rather than ambient variables, supplies the
   three Compose authority labels. Static validation requires labels on every production service, network, and named
   volume.
3. `RollbackCleanupEvidenceV1` is a closed, canonical, digest-bound file at the deterministic attempt path. It owns
   the production cleanup result and references, rather than duplicates, the existing restore lifecycle.
4. `DeploymentAttemptV1.rollback` remains exactly its current seven fields. The active oracle validates an internal
   `{applicationRollback, cleanupReference}` pair, projects only `applicationRollback`, and binds both into the
   terminal transition digest.
5. Fresh cleanup is reachable only for `previousRelease === null`. It verifies lifecycle authority, exact labels,
   configured-principal database access, and zero application rows before deletion. It re-enumerates containers,
   networks, and volumes until consecutive empty samples prove quiescence.
6. Historical evidence is read-only. No migration, rewrite, re-sign, or replacement script is introduced.

## Package and ownership boundaries

- `scripts/lp05/database`: live database identity and read-only row-count facts.
- `scripts/lp05/deploy`: attempt-scoped labels, lifecycle persistence, rollback coordination, resource cleanup.
- `deploy/compose.production.yaml`: declarative non-secret resource labels only.
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
- final exact-project container/network/volume counts are zero and a foreign sentinel resource is unchanged.

### Negative checks

- Wrong configured role fails before trusted identity and never retries another role.
- Missing/foreign attempt, target, candidate, compose-project, environment, or role labels block cleanup.
- Nonzero application rows block cleanup.
- Extra or missing fields, wrong canonical digest, wrong authority binding, and false empty observations are rejected.
- Partial cleanup or resource reappearance cannot produce `CLEANED` or `ROLLED_BACK`.
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
- Update `docs/feature/lp-05-deployment-release/evidence-schema.md` with the additive cleanup record and label chain.
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
| Compose reuses a foreign volume/network | Require empty pre-inventory plus exact live authority labels before any destructive command |
| Cleanup races a late forward actor | Retain controller join/recovery lock and require post-cleanup quiescence |
| Application-row count is incomplete | Enumerate all application-owned public tables with quoted identifiers; exclude only the two migration ledgers; fail on query/parse ambiguity |
| Cleanup evidence weakens strict attempt schema | Keep it out of `attempt.rollback`; closed independent record plus digest reference only |
| Real Docker test accidentally targets production | Unique generated project, temporary roots, loopback/no public app start, exact cleanup trap, production-name refusal |

## Open decisions

None. Implementation must return to Requirements if it needs broader deletion authority, a public contract change,
production access, historical mutation, or release/deployment authorization.
