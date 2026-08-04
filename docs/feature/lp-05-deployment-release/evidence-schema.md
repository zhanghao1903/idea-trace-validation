# LP-05 public evidence contract (`1.0`)

This document describes the records implemented under `scripts/lp05/**`. It is a verification contract, not a
deployment or human authorization source. The authoritative requirement/design/approved-plan chain remains in this
feature directory.

## Common protocol

- Records are closed objects: missing or unknown fields fail.
- `canonical-json-v1` normalizes strings to NFC, accepts safe integers only, orders object keys by Unicode code point,
  preserves defined array order, writes UTF-8 JSON with no whitespace or trailing newline, and rejects unsupported
  values.
- A record digest is lowercase SHA-256 over canonical bytes with that record's own digest field omitted.
  `DeploymentAuthorizationEnvelopeV1` additionally omits derived `envelopeId`; its ID is `auth_` plus the first 32
  digest hex characters.
- Immutable records are mode `0600` (candidate manifest `0644`), fsynced and atomically renamed. Attempt projections
  may be atomically replaced only if every existing journal entry remains byte-equal and one legal entry is appended.
- Evidence forbids raw authorization text, bearer/cookie/password/secret values, database URLs, usernames in URLs,
  response bodies, private business text, private key material, and raw logs.

## Record shapes

| Record | Required top-level fields | Derived identity and critical validation |
| --- | --- | --- |
| `ReleaseCandidateManifestV1` | `schemaVersion`, `manifestSha256`, `releaseId`, `sourceCommit`, `sourceTree`, `createdAt`, `platform`, `applicationVersion`, `imageName`, `imageId`, `ociArchive`, `baseImages`, `migrationCatalog`, `webAssetsSha256`, `openapiSha256`, `verification`, `syntheticDataOnly` | Exact reviewed head before merge; authoritative base-reachable merge commit in production. Archive/image/platform, ordered official image locks, three migration digests, Web/OpenAPI digests and exact-head `npm run verify` must pass. |
| `DeploymentProposalV1` | `workflowId`, `featureId`, `mergeCommitSha`, `candidate`, `target`, `backupPolicy`, `operations`, `excludedOperations`, `syntheticPublicReadConsent`, `previousRelease`, `toolchain`, `proposedAt` | Production candidate source equals merge commit; public target/platform equality; all mandatory operations and publication/destructive exclusions; Docker/Compose/age exact ranges. `proposalSha256 = SHA256(canonical proposal)`. |
| `DeploymentAuthorizationEnvelopeV1` | `schemaVersion`, `envelopeId`, `envelopeSha256`, `proposal`, `proposalSha256`, `authorization`, `createdAt` | Current workflow/feature/Main task; raw response digest only; expires within 24h; one attempt; no Requirements/plan/code/merge authority substitution. |
| `DeploymentAttemptV1` | `schemaVersion`, `attemptId`, `attemptRecordSha256`, envelope refs, `candidate`, `target`, projection/time/resume fields, release/DB/safety/migration/smoke/backup/restore/rollback projections, `transitionLog`, `knownLimitations` | Sequence 0 is exactly `from:null -> PREPARED`; later transitions are hash-chained, legal, maximum 64. Fresh `sourceDatabase` may remain null through preflight but is required after actual DB creation/inspection before safety resolution. One bounded resume. |
| `HostActiveRuntimeV1` | `schemaVersion`, `evidenceRoot`, `candidateManifestPath`, backup IDs, initial/post-smoke runtime inputs, restore project/database/loopback identifiers and proof paths | Closed non-secret operational inputs only. It has no evidence/PASS/result field, cannot name a completed transition, and cannot substitute for active observation. |
| `AttemptRuntimeBindingV1` | `schemaVersion`, `attemptId`, `runtime`, `previousEnvironmentSha256`, `bindingSha256` | Written before the first attempt mutation and byte-equal on restart. It prevents stale-lock recovery from changing evidence roots, restore-project identity or prior-environment authority. |
| `ActivePhaseOutputV1` | `schemaVersion`, `phase`, `attemptId`, `envelopeId`, target/candidate refs, `observedAt`, `payload`, `status`, `evidenceSha256` | Controller-owned atomic record at the exact attempt/phase path. Payload shape is phase-specific; an existing output is reusable only after active reconciliation reproduces its canonical bytes. |
| `RestoreLifecycleV1` | `schemaVersion`, attempt/envelope/target/candidate refs, `composeProject`, `databaseName`, `state`, `isolatedTarget`, `cleanup`, `updatedAt`, `lifecycleSha256` | Written as `CREATING` before Compose mutation, then `READY`, `QUIESCING`, `CLEANED`, or `CLEANUP_FAILED`. Cleanup persists `QUIESCING`, requires exact project labels plus consecutive empty observations after the owning actor settles, records resource-set/target digests, and is reusable for deadline and stale-lock recovery without granting forward authority. |
| `ProductionLifecycleV1` | `schemaVersion`, attempt/envelope/target/candidate refs, `authorityLabels`, `state`, `preMutation`, `ownedBeforeCleanup`, `cleanupReference`, fixed `policy`, times/digest, `composeProject` | Fresh attempts persist an empty exact-project observation before Compose mutation. Cleanup authority exists only for `previousRelease=null`, exact attempt labels and empty application tables read as the configured database principal. Terminal states require the exact rollback-cleanup reference. |
| `RestoreLifecycleV2` | the common lifecycle fields plus `restoreComposeProject`, `databaseName`, `isolatedTarget` | Additive replacement for new attempts at the historical `restore-lifecycle.json` path. V1 remains read-only historical evidence. V2 binds containers, networks and volumes to attempt/target/candidate labels and requires an exact isolated target in `READY`. |
| `DockerResourceIdentityV1` / `DockerResourceObservationV1` | closed variant identity; observation time, sorted container/network/volume arrays, exact counts and resource-set digest | Containers and networks are deleted only by immutable Docker ID. A volume is deleted only by exact name after just-in-time full identity equality. The persisted volume field is `mountpointSha256`, never the host path. Missing labels, foreign ownership, same-name replacement or set drift fails before deletion. |
| `RollbackCleanupEvidenceV1` / `RollbackCleanupReferenceV1` | authority refs, strict application-rollback digest, production/restore cleanup results, times/status/reason/digest; fixed attempt-relative reference | Stored only as `<attempt>/rollback-cleanup.json`; the resolver rejects alternate paths and recomputes the digest. Production PASS also requires the configured `{databaseUser,databaseName}`, zero application rows, exact deletion arguments and consecutive zero observations. Upgrade production is `NOT_APPLICABLE` and byte-preserved. |
| `ForwardRestoreCleanupEvidenceV1` / forward cleanup reference | authority refs, restore project/database, ordered times, one closed restore cleanup result, status/reason/digest; fixed attempt-relative reference | Stored only as `<attempt>/forward-restore-cleanup.json`. Normal restore cleanup must persist this record and transition the exact V2 lifecycle to `CLEANED` before returning PASS. If deletion completed before this record was written, only exact RESTORE `QUIESCING` authority with a nonempty frozen set plus consecutive empty live observations may recover without a second delete; partial/nonempty drift and production cleanup fail closed. Actual rollback checks this fixed path before new cleanup: absence permits lifecycle-only recovery, exact matching content is resolved and reused, and malformed or wrong-bound content aborts before new deletion or PASS evidence. Later rollback resolves the terminal authority, proves the project remains empty and reuses the result without another deletion; only the rollback aggregate may authorize terminal rollback evidence. |
| `TerminalRollbackEvidenceV1` | authority refs, strict application-rollback digest, cleanup reference/digest, terminal state/reason/evidence digest | `ROLLED_BACK` requires application rollback `PASS|NOT_APPLICABLE` and both independently resolved cleanup results to pass or be validly not applicable. Its digest is the rollback transition evidence; cleanup fields never enter the closed seven-field `DeploymentAttemptV1.rollback`. |
| `BackupManifestV1` | `schemaVersion`, `backupId`, `backupManifestSha256`, `purpose`, envelope/attempt/target refs, `sourceDatabase`, `sourceRelease`, candidate/migration/story refs, `createdAt`, `ciphertext`, `encryption`, `tool`, `verification` | Purpose cannot be relabelled. Post-deploy requires the exact production DB and initial story; safety requires null story. Ciphertext and `pg_restore --list` digests must pass. |
| `RestoreEvidenceV1` | `schemaVersion`, `restoreId`, `restoreEvidenceSha256`, authority refs, `backup`, source DB digest, `isolatedTarget`, times, `migration`, `restoredStory`, `productionBefore`, `productionAfter`, `cleanup`, `status` | Exact post-deploy backup/ciphertext; isolated app origin plus exact Compose project/container/volume/name, live labels and system ID; import executes inside that same container; complete active production identity matches before mutation and remains byte-equal after; equal migration/story/resource/assertion-set and exact cleanup PASS. |
| `SmokeEvidenceV1` | `schemaVersion`, `smokeId`, `smokeSha256`, `mode`, authority refs, `origin`, `observedAt`, `certificate`, story/resource digests, `assertionSetSha256`, `assertions`, `status` | Mode is `LOCAL`, `EXTERNAL_INITIAL`, or `EXTERNAL_POST_RESTORE`. Imported observations are LOCAL only. External records come from the active engine, require trusted current TLS with exact hostname, and include the complete unique observed assertion set. |
| `DeploymentEvidenceV1` | schema/digest/ID, lifecycle and merge refs, envelope/attempt refs, candidate/target/migration, initial smoke, post-deploy backup, restore, production equality, post-restore smoke, transition tail, operations/times/limitations/status | Final verifier loads exact referenced records/digests and recomputes the full equality chain. Status is `PASS` only after final `POST_RESTORE_SMOKE_PASSED -> DEPLOYED`. |

Nested closed shapes are the field matrices in
[`design.md`](./design.md#5-durable-authority-records-and-deployment-state). The implementation adds no optional
authority not named there.

## Candidate provenance

`CandidateIdentityV1` contains exactly `manifestSha256`, `releaseId`, `sourceCommit`, `sourceTree`, `imageId`,
`archiveSha256`, and `platform`. A pre-merge candidate equals the reviewed feature head. A production candidate
equals the authoritative merged base commit, which must be reachable from the configured base ref. This explicitly
supports squash merge without pretending the merge commit exists in feature history.

## Attempt state graph

```text
null -> PREPARED -> PREFLIGHT_PASSED -> SAFETY_BACKUP_RESOLVED
     -> MIGRATION_SUCCEEDED -> APP_READY -> HTTPS_READY
     -> INITIAL_SMOKE_PASSED -> POST_DEPLOY_BACKUP_VERIFIED
     -> RESTORE_ENV_READY -> RESTORE_VERIFIED
     -> PRODUCTION_UNCHANGED_VERIFIED -> POST_RESTORE_SMOKE_PASSED -> DEPLOYED
```

Every non-terminal forward state, plus `INTERRUPTED`/`RESUMING`, may enter `FAILED`; after app replacement, ingress
is disabled and the app may enter `ROLLING_BACK -> ROLLED_BACK|ROLLBACK_FAILED`. One early process interruption may
use `INTERRUPTED -> RESUMING` and resume only a revalidated recorded state before envelope/attempt deadlines.
Post-phase authority/deadline failure and late stale-lock recovery use already-bound safety authority to persist the
terminal chain without another forward mutation. Recovery first holds an exclusive recovery lease, verifies the
exact prior owner is dead, and cannot remove a concurrently acquired lock. At/after post-deploy backup it cleans the
attempt-bound restore lifecycle instead of blindly resuming. For a fresh install only, recovery may also remove the
exact attempt-owned production containers, networks and volumes after the configured PostgreSQL principal proves
all application tables empty. Upgrade resources, foreign resources and ambiguous identities are never removed.
Ordinary forward re-entry is rejected. Each successful
phase must have a controller-owned active output reconciled against the live resource; a caller bundle cannot
advance this graph. An oracle failure never retries under the same envelope.

## Smoke assertion identity

The ordered mandatory IDs are exported as `REQUIRED_SMOKE_ASSERTION_IDS`. `assertionSetSha256` is SHA-256 over the
canonical ordered projections `{id,status,httpStatus,valueSha256,reasonCode}`. It deliberately excludes volatile
`observedAt` and `requestId`, allowing initial and post-restore observations to prove the same assertion contract
without claiming identical request metadata.

## Retention and expiry

- Authorization expires no later than 24 hours after explicit authority; attempts are at most four hours with one
  bounded early interruption window. The controller abort signal terminates active `pg_dump`/`age`,
  `age`/`pg_restore`, and nested Docker child processes at the attempt deadline. The owning oracle Promise is always
  joined before terminal recovery; a signal-ignoring actor may delay failure but cannot mutate after rollback.
- Envelopes bind one attempt. Terminal failure, target/candidate/operation drift, or expiry requires new authority.
- Backup policy is daily/newest seven. Every pair referenced by an active attempt or final evidence is pinned even if
  older. Failed/unverified pairs do not trigger retention.
- Evidence and referenced backups remain until separate exact archival/deletion authorization after closure.

## Cross-record equality chain

1. Candidate identity is byte-equal across manifest, proposal/envelope, attempt, smoke, backup, restore, and final.
2. Target and attempt IDs are equal for every external record.
3. Post-deploy backup source DB equals the actual production DB after initial synthetic smoke.
4. Its purpose/story/candidate/attempt/target equal the initial smoke; safety/local/stale records cannot substitute.
5. Restore IDs and ciphertext equal that backup and the target is demonstrably isolated.
6. Restored migration, story, resource, and assertion-set identities equal candidate/initial smoke.
7. Production resource identities before/after are canonical-byte-equal.
8. Post-restore external smoke equals target/candidate/story/resource/assertion-set and follows restore/equality PASS.
9. Final evidence references all exact digests and the final transition tail.
