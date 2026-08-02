# Implementation Plan: LP-05 部署与发布就绪

- FeatureId: `lp-05-deployment-release-8c3f1a6d5e20`
- Branch: `codex/lp-05-deployment-release`
- Authoritative baseline: `46e021d261fd8a663c83430a551f5674365ccf14`
- Requirements authority: `d273a79212723513d8ac7150fb141949f6b19472`
- Design commit entering F3: `84f7b467ed6b85c9ff1cdc1b7774eb0402049ee5`
- Requirements: [requirements.md](./requirements.md)
- Design: [design.md](./design.md)
- Current phase: F3 — Implementation planning
- Delivery mode: repository release-readiness first; separately authorized target deployment after merge; no default
  tag, Release, package, registry or marketplace publication

## 1. Entry Gate And Scope Control

### 1.1 Development Authority

This plan does not authorize implementation. Main may create an `INITIAL_IMPLEMENTATION` GoalRun only after
Engineering Review returns PASS for the exact plan commit and composite digest. Review PASS still does not authorize
SSH, DNS, production secrets, server mutation, public deployment or release publication.

The Goal is limited to repository-owned release-ready assets and disposable local/CI proof. It must stop and return
to Requirements if a real deployment requires changing an LP-01–LP-04 domain/API/Web/Skill contract.

### 1.2 Product Workflow Classification

- Task type: build/deployment tooling, container topology, operations safety, tests and documentation.
- Runtime impact: packaging and process composition only; no product behavior or persisted schema change.
- Public impact: HTTPS transport and public hosting of existing routes after a later authorization.
- Safety impact: high for secrets, production data, backup/restore and external server operations.
- Required records: `CHANGELOG.md`, feature verification, project management and source-plan updates.
- External mutation gate: exact target/candidate authorization after merge, followed by read-only preflight.
- Product-specific computer-use package gate: not applicable to this Node/PostgreSQL repository.

### 1.3 Allowed And Forbidden Paths

Expected implementation paths:

- `deploy/**`, `.dockerignore`;
- `scripts/lp05/**`, dedicated unit/acceptance tests;
- `.github/workflows/ci.yml`, `package.json`, `.gitignore`;
- `README.md`, `CHANGELOG.md`, `docs/operations/lp05.md`;
- this feature directory, `docs/project-management.md`, and the LP-05 source plan.

Forbidden without a new confirmed RequirementsHandoff:

- `packages/domain/src/**`, `packages/application/src/**`, `packages/db/src/**` and all migrations;
- `packages/contracts/src/**`, `packages/contracts/schemas/**`, `openapi/**`;
- `apps/api/src/**`, `apps/web/src/**` and LP-04 Skill/demo/client-evidence behavior;
- installed Lifecycle/plugin code, DNS/SSH credential files and any real target configuration.

`package-lock.json` may change only if a genuinely required, reviewed dependency is added. The planned
implementation uses Node 24 built-ins and existing Vitest/tsx tooling, so the default expectation is no npm
dependency and no lockfile change.

## 2. Frozen Compatibility Inputs

| Artifact | Baseline SHA-256 | Rule |
| --- | --- | --- |
| `openapi/lp03.v1.json` | `fe853576812ae5d133f6d2880c3b2d3cb07de3f7dbe49471953d4bb6105cd18c` | Current public contract; no diff |
| `package-lock.json` | `f5663e96e0b914c2ceb234f869f5b92bce05d15e3934091c97c06c4523123b67` | Expected unchanged |
| `0001_lp01_core.sql` | `e8edd4cea0668ece3282f3dc8fedae292b2b9d90ed16f02bfbcad9b06bf25e70` | Image inclusion/readiness only |
| `0002_lp02_execution_decisions.sql` | `2c262ea46ab82cfbc4c120c202a34600dbb69388f75383f075ec4a1870f679c8` | Image inclusion/readiness only |
| `0003_lp03_reporting_experience.sql` | `695144b211a8a8be3c3feac30f8edc0ecdf2bf5ed61571106be8e1f2996c578a` | Image inclusion/readiness only |

Every slice runs a forbidden-path diff against baseline. A necessary compatibility fix becomes a separate confirmed
feature rather than an opportunistic LP-05 change.

## 3. Slice 1 — Immutable Candidate Builder

### 3.1 Files

- `deploy/Containerfile`
- `.dockerignore`
- `deploy/images.lock.json`
- `deploy/runtime/entrypoint.mjs`
- `deploy/runtime/healthcheck.mjs`
- `deploy/release.env.example`
- `scripts/lp05/shared/contracts.ts`
- `scripts/lp05/shared/canonical-json.ts`
- `scripts/lp05/shared/filesystem.ts`
- `scripts/lp05/shared/redaction.ts`
- `scripts/lp05/candidate/build.ts`
- `scripts/lp05/candidate/verify.ts`
- matching `*.unit.test.ts`
- `.gitignore` for `.lp05-release/`
- `package.json` commands `release:lp05:candidate`, `release:lp05:verify-candidate`,
  `test:deployment:unit`

### 3.2 Build Contract

1. Resolve a clean exact HEAD and tree; reject dirty tracked state, detached source mismatch, shallow unknown commit,
   unsupported platform and `latest`.
2. Validate `deploy/images.lock.json`: schema version, exact Node/PostgreSQL/Caddy version+digest, supported
   platforms and no duplicate/floating refs. Implementation resolves real digests through authoritative registries
   and commits them; no placeholder digest may enter Review.
3. Run `npm ci` and `npm run build` in the builder; production prune and copy only runtime dependencies, compiled
   packages/API, Web dist, migration SQL/catalog and entrypoint into the final image.
4. Set OCI labels for revision/version/source and write `/app/release.json`; run numeric non-root user. No Git,
   `.env`, `.lp04-demo`, `.lp05-release`, tests, raw evidence or secret enters a layer.
5. Build with explicit platform, inspect image ID/labels/files/UID, export a local OCI archive atomically and emit
   `ReleaseCandidateManifestV1` exactly as Design §3.2.
6. Verify archive digest/size, loaded image ID, migration/Web/OpenAPI digests and same-head `npm run verify` proof.
   A candidate manifest is `PASS` only after every assertion succeeds.

The candidate directory is ignored and may be removed only by resolving an exact release ID under
`.lp05-release/`; tooling never accepts `/`, home, workspace root or arbitrary glob cleanup.

### 3.3 Tests And Slice Gate

- strict manifest/config parsing, canonical digest and changed-head/platform/image negative fixtures;
- dirty-tree, `latest`, missing digest, secret build arg, symlink/path traversal and oversized-file rejection;
- Containerfile static checks for pinned `FROM`, non-root runtime, no secret ARG/ENV and expected copy allowlist;
- build one disposable host-platform image and prove release labels, UID, files, healthcheck and archive replay;
- inject canary secrets into runtime secret files and prove image layers/history/archive contain none;
- `npm run verify`, targeted unit tests and `git diff --check`.

Commit/push as `build(lp05): add immutable release candidate`. Rollback reverts Slice 1 and removes only an exact
ignored candidate directory; it has no database or external effect.

Trace: AC 1, 3, 7, 13–14, 20.

## 4. Slice 2 — Hardened Compose, Caddy And Local Production Acceptance

### 4.1 Files

- `deploy/compose.production.yaml`
- `deploy/compose.test.yaml`
- `deploy/Caddyfile`
- `deploy/Caddyfile.test`
- `deploy/secrets/README.md`
- `scripts/lp05/deploy/config.ts`
- `scripts/lp05/deploy/preflight.ts`
- `scripts/lp05/deploy/compose.ts`
- `scripts/lp05/smoke/http.ts`
- `scripts/lp05/smoke/security.ts`
- `scripts/lp05/smoke/network.ts`
- `scripts/lp05/smoke/run.ts`
- matching unit/contract tests and a disposable local Compose acceptance
- `package.json` commands `deploy:lp05:validate`, `test:deployment:local`

### 4.2 Compose And Secret Contract

Implement the four services and two-network topology from Design §4. Production config publishes only host 80/443,
contains no default production credential, binds exact image references, and hardens every process with the minimum
writable paths/capabilities. The DB is healthy before migration; migration must exit 0 before app; app readiness must
pass before Caddy is considered usable.

The entrypoint reads only the declared `/run/secrets` files, rejects symlink/empty/oversize values, constructs the DB
URL without logging it and `exec`s Node. Tests cover missing/malformed/same AI-human credentials and ensure Compose
render/log output never contains canary values.

`compose.test.yaml` is additive and disposable: unique project/volumes, loopback high ports, synthetic credentials,
local Caddy CA and explicit safe labels. It cannot be used as production evidence and cleanup rejects resources
without its exact project/attempt labels.

### 4.3 HTTPS And Compatibility Proof

- validate both Caddyfiles using the pinned image;
- through the local reverse proxy verify redirect, TLS, HSTS, CSP/content-type/frame/referrer headers and cache rules;
- assert `/health/live`, `/health/ready`, `/openapi.json`, proposer/executor/project/confirmation SPA routes;
- send ordinary/report body boundary fixtures through Caddy and compare status/error shape with direct Fastify
  expectations so the proxy neither bypasses nor rewrites limits;
- prove Authorization, Idempotency-Key and scoped cookie behavior remains intact without logging values;
- stop DB in the disposable project and prove ready/business fail while live still represents process liveness;
- inspect listeners and networks to prove app/DB/admin/backup are not host-published.

### 4.4 Slice Gate And Rollback

Run candidate verification, Compose/Caddy validation, local acceptance, full LP-01–LP-04 acceptance/browser gates
and secret scan. Commit/push as `ops(lp05): add hardened production topology`.

Rollback reverts configs/scripts and tears down only the exact disposable test project. No production host is in
scope. Trace: AC 2–8, 11, 13–14, 18, 20.

## 5. Slice 3 — Backup, Isolated Restore, Rotation And Operations Status

### 5.1 Files

- `scripts/lp05/database/backup.ts`
- `scripts/lp05/database/backup-manifest.ts`
- `scripts/lp05/database/retention.ts`
- `scripts/lp05/database/restore.ts`
- `scripts/lp05/database/restore-smoke.ts`
- `scripts/lp05/deploy/rotate-credentials.ts`
- `scripts/lp05/deploy/ops-status.ts`
- matching unit and disposable Compose acceptance tests
- `deploy/systemd/idea-validation-backup.service.example`
- `deploy/systemd/idea-validation-backup.timer.example`
- `package.json` commands for backup, restore smoke, rotation smoke and ops status

### 5.2 Backup And Retention

Implement `BackupManifestV1` from Design §6.1. The command requires resolved approved backup root, current candidate
manifest and age recipient fingerprint; sets restrictive permissions; streams custom-format `pg_dump` directly to
age; atomically publishes ciphertext+manifest only after digest and list verification. Failures leave no accepted
manifest and never delete the prior valid backup.

Retention sorts verified manifest pairs, retains newest seven and deletes only files named by valid manifests under
the exact root. Unit fixtures include symlink escape, root/home/workspace target, incomplete pairs, newest failure,
duplicate ID and concurrent lock rejection. The systemd examples contain placeholders and are not enabled by tests.

### 5.3 Isolated Restore

The restore controller implements every Design §6.2 guard before decrypting: generated `lp05-restore-` project,
distinct volume/container labels, loopback-only port, no production domain/name/volume, exact backup digest and
identity reference. It streams into a new DB, verifies three migration ledgers/checksums, starts exact app image and
uses public API to read selected LP-04 synthetic Idea/project/report resources.

Acceptance captures production-resource identity before/after and asserts unchanged. Negative fixtures attempt a
production project/volume, wrong key, corrupt backup, migration drift, missing synthetic record and cleanup-label
mismatch; every case fails without touching production-labelled resources.

### 5.4 Rotation And Operational Status

- rotation uses atomic secret-file replacement, app-only restart, bounded readiness and the Design §7.2 old/new
  credential oracles; rollback restores previous files if either credential proof fails;
- human rotation uses an existing synthetic confirmation read and never decides it;
- `ops-status` reports only stable health/restart/cert/disk/backup/smoke codes and sanitized timestamps/digests;
- tests cover stale backup, low disk, restart loop, unhealthy app/DB, certificate warning and log redaction.

### 5.5 Slice Gate And Rollback

Run encrypted backup and isolated restore against the disposable production Compose test project, migration/public
read proof, rotation tests, ops-status tests, all prior gates and tracked/ignored secret scans. Commit/push as
`ops(lp05): add backup restore and rotation tooling`.

Rollback reverts repository tooling only. Test cleanup removes exact labelled resources. Real DB restore is never a
test or automatic rollback action. Trace: AC 7–13, 16–18, 20.

## 6. Slice 4 — Deployment Controller, Rollback And Evidence

### 6.1 Files

- `scripts/lp05/deploy/authorization-envelope.ts`
- `scripts/lp05/deploy/attempt-record.ts`
- `scripts/lp05/deploy/controller.ts`
- `scripts/lp05/deploy/rollback.ts`
- `scripts/lp05/smoke/demo.ts`
- `scripts/lp05/smoke/evidence.ts`
- matching state-machine, fault-injection and end-to-end tests
- `package.json` commands `deploy:lp05`, `deploy:lp05:rollback`, `deploy:lp05:smoke`,
  `deploy:lp05:verify-evidence`

### 6.2 Authority And State Enforcement

The controller consumes an operator-created, sanitized authorization-envelope file whose candidate, target, domain,
backup root, operation allowlist and evidence digest equal the user-approved proposal. It does not accept SSH/DNS
credentials or infer approval from Requirements/Review/merge. The external operator decides how the command reaches
the already authorized server; repository code does not implement a generic SSH client.

Implement `DeploymentAttemptV1` and exact transition table from Design §5.2 using mode-0600 atomic replacement and a
single-target lock. Before every resume, re-read candidate/image/container/backup/migration external facts. A record
cannot authorize a skipped step, a different candidate or a second concurrent attempt.

Ordered execution is:

1. read-only target/DNS/ports/runtime/disk/secret-file/config/image preflight;
2. verified encrypted pre-deploy backup;
3. exact migration job and ledger verification;
4. exact app replacement and readiness;
5. Caddy validation/start, trusted HTTPS and header/contract smoke;
6. LP-04 synthetic story and operational smoke;
7. atomic `DEPLOYED` evidence only after every oracle passes.

Fault injection at every boundary proves no later step runs after failure. Interrupted runs reconcile state without
blindly repeating migration. Failure captures previous image/config; app rollback restores it and reruns
readiness/core reads. DB restore remains impossible from this command.

### 6.3 Evidence Contract

Emit and verify `DeploymentEvidenceV1` from Design §7.3. The verifier independently re-reads candidate manifest,
attempt transitions, backup/restore manifests and live HTTPS assertions, then validates bounded sanitized content.
Hand-written PASS, missing restore proof, stale URL/candidate, secret-bearing evidence or incomplete synthetic story
must fail.

Local end-to-end tests run the controller only against the labelled loopback Compose environment and a local TLS
mode. They prove orchestration and rollback but explicitly mark trusted public certificate/DNS assertions unproved.

### 6.4 Slice Gate And Rollback

Run state/fault tests, local full deployment, failed readiness/smoke rollback, evidence negatives, backup/restore,
rotation, complete regression and secret scans. Commit/push as `test(lp05): prove deployment and rollback workflow`.

Rollback reverts the controller/evidence code and tears down exact disposable resources. It never connects to a real
target before post-merge authorization. Trace: AC 3–18, 20.

## 7. Slice 5 — Documentation, Management Facts And Final Candidate Gate

### 7.1 Files

- `docs/operations/lp05.md`
- `docs/feature/lp-05-deployment-release/verification.md`
- `docs/feature/lp-05-deployment-release/evidence-schema.md`
- `README.md`
- `CHANGELOG.md`
- `docs/project-management.md`
- `docs/implementation-plans/v0-1/lp-05-deployment-release.md`
- `.github/workflows/ci.yml`
- `package.json` final `verify` integration where needed

### 7.2 Runbook Truth Rules

The runbook covers supported Linux/platform/runtime, DNS/80/443, filesystem ownership, candidate transfer/load,
repository-external secrets, first deploy, upgrade, migration, health, logs, daily backup, isolated restore,
credential rotation, disk/certificate/backup failures, app rollback and the separate production-restore authority.
Every command uses placeholders or safe references; no real target/token/URL/password is committed.

It clearly distinguishes:

- local/CI production-like PASS from real public deployment PASS;
- app rollback from separately authorized DB restore;
- `DEPLOYED` operational evidence from Lifecycle acceptance;
- Requirements/plan/code/merge authority from exact external deployment authorization;
- local OCI candidate transfer from tag/Release/package/registry publication.

Project management/source plan update atomically:

- LP-04 becomes `Accepted` with merge `46e021d261fd8a663c83430a551f5674365ccf14`, acceptance ID
  `cf7593f335dacb092294d51f97bcd9d9e957293c8dc1f570307066c342fe48af`, closure ID
  `14a81f052aff6dc34ba6bb6550a725a0f5f926ade104515cf1ab85bcca1ce1eb`, targets `[]`;
- LP-05 becomes `Ready for Acceptance` only for repository release-readiness after all exact-head gates;
- LP-05 acceptance remains `None`, with server/domain/backup/authorization inputs listed as release-phase blockers;
- no actual URL, deployment, certificate, backup or restore is described as completed before external proof.

### 7.3 CI And Final Verification

Extend the existing GitHub Actions job or add one bounded deployment job using disposable Docker resources. Pin
Actions and service/container images; do not expose production secrets. Required exact-head commands:

```text
npm ci
npm run db:migrate:test
npm run verify
npm run test:deployment:unit
npm run deploy:lp05:validate
npm run release:lp05:candidate -- --platform <ci-platform> --output .lp05-release/ci
npm run release:lp05:verify-candidate -- --manifest .lp05-release/ci/manifest.json
npm run test:deployment:local
npm run test:backup-restore:lp05
npm run test:rotation:lp05
npm run test:deployment:rollback
git diff --check
```

Also prove:

- forbidden-path and frozen-digest equality;
- exact pinned image digests and Caddy/Compose validation;
- non-root/read-only/no-extra-port runtime inspection;
- candidate archive/image/history/log/evidence secret absence;
- three migration checksum equality and isolated restored public reads;
- LP-01–LP-04 API/browser/demo/client-evidence regression;
- no `.lp04-demo`, `.lp05-release`, secret, backup, TLS data, raw logs or Playwright artifact is staged.

Write `verification.md` only from actual command output on exact head. Public DNS/certificate/deployment lines remain
`NOT_RUN — awaiting separately authorized target` and prevent formal LP-05 acceptance, but do not prevent the
repository assets from entering code review.

Commit/push as `docs(lp05): record release readiness and operations`. Rollback reverts docs/CI only; no external
state exists. Trace: AC 1–20.

## 8. Commit And Push Plan

Use narrow immutable commits, inspecting the cached diff and pushing after each completed slice:

1. `build(lp05): add immutable release candidate`
2. `ops(lp05): add hardened production topology`
3. `ops(lp05): add backup restore and rotation tooling`
4. `test(lp05): prove deployment and rollback workflow`
5. `docs(lp05): record release readiness and operations`

Do not amend referenced commits. Never stage `.idea/`, local candidate archives, secrets, backups, TLS data, host
state, raw deployment logs or evidence containing private response bodies.

## 9. Pull Request And Engineering Review

After the Goal genuinely completes all five repository slices:

1. use platform Goal authority to complete the exact GoalRun;
2. create/update one PR from `codex/lp-05-deployment-release` to `codex/v0-1-project-plan`;
3. describe candidate/topology/backup/restore/rollback, unchanged product contract, tests, secret proof and release
   authorization boundary;
4. wait for exact-head required checks;
5. dispatch exact `CodeReviewRequest` through `workflowctl`;
6. remediate every blocking/major finding in a new GoalRun and obtain fresh exact-head approval;
7. Main never approves or merges its own PR.

Review must independently inspect the full diff, reproduce representative container/restore/rollback negatives,
verify no forbidden path or secret entered the PR and confirm that no real server/DNS/publication was touched.

## 10. Post-merge External Deployment And Acceptance

After authoritative merge proof, Main does not immediately deploy. It gathers the external inputs listed in
Requirements, runs only read-only target preflight, builds/transfers a platform-matching exact candidate, and
presents the full Design §5.1 authorization envelope. Only the user's exact authorization permits the listed target
operations.

On success, Main presents sanitized `DeploymentEvidenceV1`, candidate/attempt/backup/restore digests, trusted HTTPS
URL, smoke result and known limitations to the user and Lifecycle roles. On failure it reports the exact stopped
state and rollback proof; the feature stays open and no acceptance is recorded.

Because default confirmed scope publishes no tag, GitHub Release, package, registry image or marketplace asset, a
successful deployment is followed by a separate explicit acceptance-only/no-publish authorization bound to the
merge commit and deployment-evidence digest. Only then may Main call `record-no-publish-acceptance` and
`close-feature`. The disposition means no artifact publication, not no server deployment.

If external inputs or authorization are missing, keep `RELEASE_AWAITING_AUTHORIZATION`; do not mark a GoalRun
blocked after repository implementation is genuinely complete, do not infer acceptance and do not create a fake
release target.

## 11. Completion Condition

The implementation Goal is complete only when all five slices are committed/pushed, the candidate and disposable
production topology pass, encrypted backup/isolated restore/rotation/rollback evidence is discriminating, full
regression and exact-head CI are green, docs/management/changelog are truthful, a PR exists and no repository-scope
work remains.

External deployment, publication, Review approval, merge and formal acceptance are later Lifecycle transitions and
are not Goal completion criteria. LP-05 itself closes only after the separately authorized real deployment passes
and the user explicitly accepts the exact merge with no publication artifacts.
