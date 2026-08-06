# Verification: LP-05 0c4c304 生产版本发布

- FeatureId: `lp-05-production-release-0c4c304-7b1e9a4d2c60`
- DeliveryMode: `AGILE_REVIEWED`
- Confirmed plan: `2f291c41384d1f24fadcc64057bfe68c3b089198`
- Source commit: `0c4c30410e9a2cc2c848047214654ab9df2585a2`
- Source tree: `e95778ede5ed3b947c37a1a4129374a63195b452`
- Status: Candidate built; production release stopped before proposal because migration catalog authority is inconsistent

## Candidate result

The candidate was built from an independent clean detached worktree with Node `24.14.0`, npm `11.16.0`, Docker
Engine `29.4.0` and Docker Buildx `v0.33.0-desktop.1`.

| Field | Observed value |
| --- | --- |
| `releaseId` | `lp05-0c4c30410e9a-amd64` |
| `platform` | `linux/amd64` |
| `sourceCommit` | `0c4c30410e9a2cc2c848047214654ab9df2585a2` |
| `sourceTree` | `e95778ede5ed3b947c37a1a4129374a63195b452` |
| `imageId` | `sha256:dd1920684d79b8013a682a594ba5ff59a1b4af5138cd25f867a9d5cef5b41a55` |
| manifest canonical identity | `dc2eb49f2338d96310310c8d2ce5ba9a75bb66687fbc151971df891bbc8ad6f2` |
| manifest file SHA-256 | `fa1dc432e57adf8a92b1c37cd4a5781e39bed40fdbe2f90d169698ac6db4e93a` |
| OCI archive SHA-256 | `061463ace65f38705a33957e4b6f9c8c384c9a6a5ab27d69180a92ccc2389e64` |
| OCI archive size | `66,771,968` bytes |
| frozen OpenAPI file SHA-256 | `fe853576812ae5d133f6d2880c3b2d3cb07de3f7dbe49471953d4bb6105cd18c` |
| Web assets SHA-256 | `524f757f12a36b4b28ffc6d70591dc6351fd0dcacbdb064027c884bfc9e2c1f8` |
| full repository verification | PASS; log SHA-256 `b27759222aec7ea64db8cb5683bdd7153e68f6737868580decb7f8632b72b6c2` |
| production provenance verifier | `LP05_CANDIDATE_PASS` |

The OCI archive is a local build artifact and is not committed or uploaded. No proposal, authorization envelope or
production attempt was created.

## Blocking semantic mismatch

The successful generic manifest verifier proves closed shape, hashes and allowed ledger enum values, but it does
not compare the manifest ledger values with the application runtime's authoritative migration catalog.
Independent review found:

| Migration | Candidate builder / manifest | Runtime authority |
| --- | --- | --- |
| `0001_lp01_core` | `legacy` | `legacy` |
| `0002_lp02_execution_decisions` | `feature` | `legacy` |
| `0003_lp03_reporting_experience` | `feature` | `feature` |

Exact sources:

- `scripts/lp05/candidate/build.ts` hard-codes `0002_lp02_execution_decisions` as `feature`.
- `packages/db/src/migrations.ts` defines the same migration as `legacy` and is the runtime source used by the
  migration runner.
- Several LP-05 fixtures repeat the builder value, so the configured tests do not detect the cross-source drift.

This mismatch is the previously identified migration-ledger classification defect. It violates `REQ-02`, `AC-01`
and the confirmed plan's requirement that the candidate migration catalog be a truthful deployment authority.
Generating a proposal despite the mismatch would authorize bytes whose manifest contradicts their runtime.

## Stop decision

Per `REQ-14` and the confirmed plan, this release stops before proposal construction and production preflight.
The fix belongs to a separate narrow Requirements feature that makes one migration catalog authoritative across
runtime, builder and tests, then rebuilds a new candidate and proposal. The current candidate is retained only as
local diagnostic evidence and must not be authorized or deployed.

## Production impact

- `idea.zhanghao.work` was not accessed through SSH or a deployment runner during this release preparation.
- No production container, network, volume, database, Caddy configuration, secret, backup or state journal was
  read or modified.
- No `DeploymentProposalV1`, `proposalSha256`, authorization envelope, attempt or connection handoff was created.
- The currently deployed release remains unchanged.
