# PR #9 code re-review — Cycle 2 (`c637f2140b54`)

## Decision

**APPROVE / READY** for exact base `d181bf9a02a8c47da909050faa213fbc5efb71e7` and exact head `c637f2140b54f6d56318841e30cad1881e4eee09`.

This `AGILE_REVIEWED` re-review supersedes the Cycle 1 `REQUEST_CHANGES` report. All five remediation commits and all 16 delta files were classified, the effective base-to-head diff was reconciled with the initial full review, and the three prior critical findings are resolved. No critical regression introduced by the remediation was found. Review is read-only, so it records `READY` and does not merge.

## Finding revalidation

### PRR-001 — resolved

`storeProfile` now persists both directions of credential-usability transition for an identity-identical profile. The exact-head real-HTTP regression proves a successful `VERIFIED` profile, an unknown transport result that returns non-success without claiming current proof, and a subsequent 401 that atomically returns and persists `UNVERIFIED` with cleared evidence.

### PRR-002 — resolved

`openapiCompatibilityDigest` now hashes the complete canonical OpenAPI document after structural LP-03 route and bearer checks. Exact-head tests mutate request bodies, parameters, security and referenced schemas; every mutation changes or rejects the digest, and live schema drift stops before a synthetic write.

### PRR-003 — resolved

The handoff now binds every non-secret field in `authoritySha256`, carries `skillTreeSha256`, and is verified before reading the bearer. `git-authority.ts` proves the source commit and its LP-03 OpenAPI, the Skill commit, exact tracked Skill file set, bytes, executable modes, repository version and expected tree digest. Exact-head negative tests reject nonexistent commits, source/OpenAPI mismatch, wrong tree, wrong version, handoff tampering and alternate Skill roots before any write.

## Delta and forward-risk review

- Reviewed commits: `8a64e50`, `2bf80e8`, `be812ad`, `08cf794`, `c637f21`.
- Reviewed all 16 previous-head-to-current-head files; no file was excluded or left unclassified.
- Reconciled the current 41-file base-to-head PR diff through the Cycle 1 full review plus this complete remediation delta.
- An independent fresh-context pass rechecked the credential state transition, handoff producer/parser/consumer chain, Git object authority, complete OpenAPI digest, side-effect ordering, tests and CI portability. It returned PASS with no critical regression.

## Validation

- `npm run test:client-profile:unit`: PASS, 13 tests.
- `npm run test:client-profile:integration`: PASS, 5 isolated real-HTTP tests.
- `npm run build`, `npm run typecheck:lp05`: PASS.
- `npm run lint`, `npm run format:check`, `git diff --check`: PASS.
- Skill checker and committed Codex/compatible evidence verifier: PASS.
- GitHub `ci / verify`: SUCCESS, run `31017717002`, job `92346052871`.
- GitHub `ci / lp05-candidate`: SUCCESS, run `31017717002`, job `92346962385`.
- Final observed PR state: OPEN, non-draft, mergeable, exact routed base/head.

No production endpoint, secret, deployment, merge, release or feature branch was modified.

Machine-readable record: `pr-review-9-c637f2140b54.json`.
