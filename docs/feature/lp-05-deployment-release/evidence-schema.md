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
| `BackupManifestV1` | `schemaVersion`, `backupId`, `backupManifestSha256`, `purpose`, envelope/attempt/target refs, `sourceDatabase`, `sourceRelease`, candidate/migration/story refs, `createdAt`, `ciphertext`, `encryption`, `tool`, `verification` | Purpose cannot be relabelled. Post-deploy requires the exact production DB and initial story; safety requires null story. Ciphertext and `pg_restore --list` digests must pass. |
| `RestoreEvidenceV1` | `schemaVersion`, `restoreId`, `restoreEvidenceSha256`, authority refs, `backup`, source DB digest, `isolatedTarget`, times, `migration`, `restoredStory`, `productionBefore`, `productionAfter`, `cleanup`, `status` | Exact post-deploy backup/ciphertext; isolated labels/origin/database; equal migration/story/resource/assertion-set; canonical production identities byte-equal; exact cleanup PASS. |
| `SmokeEvidenceV1` | `schemaVersion`, `smokeId`, `smokeSha256`, `mode`, authority refs, `origin`, `observedAt`, `certificate`, story/resource digests, `assertionSetSha256`, `assertions`, `status` | Mode is `LOCAL`, `EXTERNAL_INITIAL`, or `EXTERNAL_POST_RESTORE`. External requires trusted current TLS and exact domain. Mandatory assertion IDs are complete/unique/PASS. |
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

Every non-terminal forward state may enter `FAILED`; after app replacement, ingress is disabled and the app may
enter `ROLLING_BACK -> ROLLED_BACK|ROLLBACK_FAILED`. One process interruption may use `INTERRUPTED -> RESUMING` and
resume only a revalidated recorded state before envelope/attempt deadlines. An oracle failure never retries under
the same envelope.

## Smoke assertion identity

The ordered mandatory IDs are exported as `REQUIRED_SMOKE_ASSERTION_IDS`. `assertionSetSha256` is SHA-256 over the
canonical ordered projections `{id,status,httpStatus,valueSha256,reasonCode}`. It deliberately excludes volatile
`observedAt` and `requestId`, allowing initial and post-restore observations to prove the same assertion contract
without claiming identical request metadata.

## Retention and expiry

- Authorization expires no later than 24 hours after explicit authority; attempts are at most four hours with one
  bounded interruption window.
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
