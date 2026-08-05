# PR #9 code review — Cycle 1 (`3ada81ed5d93`)

## Decision

**REQUEST_CHANGES / NOT_REQUESTED** for exact base `d181bf9a02a8c47da909050faa213fbc5efb71e7` and exact head `3ada81ed5d937083bdaa82d44eadd1a211770679`.

This is the first `AGILE_REVIEWED` pass. The review enumerates all known critical findings at this snapshot. GitHub's required checks pass, but three independently reproduced defects break the confirmed core initialization and credential trust journey, so they are blockers under the configured delivery mode.

## Critical findings

### PRR-001 — A failed credential revalidation preserves stale `VERIFIED` authority

- **Location:** `scripts/client-profile/profile-store.ts:53-68`
- **Observation:** when the existing and candidate profile identities match, the store upgrades `UNVERIFIED` to `VERIFIED` but never applies the inverse transition. A candidate produced after a real 401/403 is discarded and the old verified profile is returned.
- **Impact:** an expired, revoked, or otherwise rejected bearer can still cause `initializeProfile` and the CLI to report `credentialVerified=true` / `PROFILE_VERIFIED` from stale local evidence. This breaks the authentication boundary and the required revalidation semantics.
- **Reproduction:** storing a `VERIFIED` profile and then storing an identity-identical `UNVERIFIED` candidate returned `{"incoming":"UNVERIFIED","stored":"VERIFIED","changed":false}`.
- **Required outcome:** a live failed/unknown credential check must never return or report stale verified usability. Preserve a prior valid file only if the command also returns a fail-closed non-success that cannot be mistaken for current proof, or durably downgrade/replace it under a specified lifecycle rule.

### PRR-002 — Incompatible request/response schemas produce the same OpenAPI digest

- **Location:** `scripts/client-profile/verify.ts:38-81`
- **Observation:** the compatibility projection hashes only route presence, status-code names, bearer-security presence, and whether a request body is required. It omits request/response schemas, actor attribution fields, parameters, and referenced component definitions.
- **Impact:** a server whose Idea POST contract is changed to an unrelated string body and whose component schemas are removed is still marked `openapi=VERIFIED`; a normal initializer can then hand the incompatible profile to the business Skill and the confirmed core journey cannot complete.
- **Reproduction:** replacing `/api/v1/ideas` POST with a required string body and clearing `components.schemas` left the digest unchanged at `82bdf36171e03d2a1a177fb92cb674ce1dfead6573e62b068bb2b0cb17bd06e0`.
- **Required outcome:** bind the handoff to the exact required public contract or a compatibility projection that covers every schema/field/parameter/security property consumed by the initialization and business Skills; add negative schema-drift tests.

### PRR-003 — Release/Skill claims are copied into a verified profile without binding them to local bytes

- **Location:** `scripts/client-profile/initialize.ts:63-77`
- **Observation:** the initializer copies `handoff.skillCommit` and `skillVersion`, computes an unrelated digest over caller-selected `skillRoot`, and never proves that the tree belongs to that commit/version or that the release/source claims correspond to the observed endpoint. `assertProfileMatchesHandoff` is unused and cannot establish the commit/tree relationship.
- **Impact:** an arbitrary or nonexistent Skill commit can be paired with any local Skill tree and still receive a fully `VERIFIED` profile after the synthetic write, defeating the exact release/Skill binding and mismatch fail-closed criteria.
- **Reproduction:** the passing integration test uses nonexistent `skillCommit="bbbb..."` with the current repository Skill tree and asserts `credentialVerified=true`.
- **Required outcome:** define verifiable handoff authority for release/source/Skill bytes, reject a commit/version/tree mismatch before writing a usable profile, and cover nonexistent commit, wrong tree, wrong version, and release mismatch cases.

## Validation

- `npm run test:client-profile:unit`: PASS, 10 tests.
- `npm run test:client-profile:integration`: PASS, 3 tests, using an isolated loopback service after granting loopback-only sandbox permission.
- `npm run build`: PASS.
- `npm run typecheck:lp05`: PASS after build generated workspace outputs.
- `npm run format:check`, `npm run lint`, `git diff --check`: PASS.
- `skill:check` and the committed Codex/compatible evidence pair verifier: PASS.
- GitHub `ci / verify`: SUCCESS, run `30980775925`, job `92224507706`.
- GitHub `ci / lp05-candidate`: SUCCESS, run `30980775925`, job `92225055619`.
- Final observed PR state: OPEN, non-draft, exact routed base/head, GitHub mergeable=true.

The committed client records and their shared authority fields were checked, but raw client transcripts are intentionally unversioned and were unavailable to Review. No production endpoint, secret, deployment, merge, release, or feature branch was touched.

Machine-readable record: `pr-review-9-3ada81ed5d93.json`.
