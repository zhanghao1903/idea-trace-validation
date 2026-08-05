# Implementation Plan: LP-05 客户端连接资料与初始化 Skill

- Feature directory: `docs/feature/lp-05-client-connection-profile/`
- Branch: `codex/lp-05-client-connection-profile`
- DeliveryMode: `AGILE_REVIEWED`
- Requirements: `requirements.md`
- Design: `design.md`
- Current phase: F3 — Implementation planning

## Scope

### In scope

- Add the client-neutral `idea-validation-init` Skill.
- Add closed deployment-handoff and client-profile contracts with safe runtime validation.
- Add deterministic initialization, update, removal and isolated credential-verification commands.
- Make `idea-validation-workflow` consume the initialized profile for writes and preserve public reads.
- Add a separate release-bound deployment handoff generator.
- Add Codex/Claude-compatible documentation, automated security/contract tests and sanitized client proof.
- Update package scripts, README/operator docs and `CHANGELOG.md`.

### Out of scope

- Server API/OpenAPI/database/Web changes.
- Production access, credential creation/delivery/rotation, deployment or release publication.
- Changes to LP-05 deployment controller, rollback authority or historical production records.
- Human-control credential handling by an AI Skill.

## Implementation Slices

| Slice | Files/modules | Behavior | Tests | Docs | Rollback |
| --- | --- | --- | --- | --- | --- |
| CP-01 Closed contracts and safe I/O | `scripts/client-profile/contracts.ts`, `canonical-json.ts`, `safe-files.ts`, `git-authority.ts`, canonical schema JSON | Parse closed handoff/profile objects, validate attribution and credential references, bind source/Skill commits to local bytes, canonicalize/digest, lock and atomically write mode-0600 profiles | schema fixtures, extra-field rejection, authority/release/commit/tree/version mismatch, digest stability, symlink/mode/lock/replay cases | Design field matrix | Remove additive runtime files |
| CP-02 Connection and credential probes | `url.ts`, `http.ts`, `credential.ts`, `verify.ts` | Canonical origin, manual redirect rejection, liveness/readiness/complete OpenAPI contract checks, secure env/file read, non-secret fingerprint, optional loopback synthetic write/read | URL/redirect/OpenAPI schema/parameter/security matrix; correct/wrong/expired/human token; stale-proof downgrade; unknown-result replay; no-write assertions | Init recovery reference | Remove probes; no persisted remote state outside synthetic fixture |
| CP-03 Init CLI and profile lifecycle | `initialize.ts`, `remove.ts`, `profile-store.ts`, package scripts | Create idempotent profile, require explicit replacement for drift, preserve timestamps/bytes on identical replay, remove profile without deleting secret | CLI stdout/stderr leak scan, update/revision/concurrency/crash tests | CLI reference | Delete local profile explicitly; credential untouched |
| CP-04 Skill integration | `skills/idea-validation-init/**`, `skills/idea-validation-workflow/**`, `scripts/lp04/check-skill.ts` | Init Skill gathers non-secret inputs and invokes CLI; business Skill resolves profile, maps allowed actor attribution, blocks uninitialized writes and stops before human routes | both-Skill static checker, broken-link/secret/human-route/profile fixtures | Codex/Claude/common client setup | Revert additive Skill and restore legacy setup text |
| CP-05 Deployment handoff | `create-deployment-handoff.ts`, validation tests, `package.json` | Generate deterministic non-secret release/base/Skill/OpenAPI handoff; never reads or emits raw token | exact fixture, release/Skill mismatch, secret-field rejection, stable bytes | LP-05 runbook/README | Stop generating handoff; deployment runtime unchanged |
| CP-06 Client compatibility evidence and merge readiness | `verify-client-evidence.ts`, ignored local transcripts, sanitized evidence records, `CHANGELOG.md` | Bind Codex and Claude/compatible isolated initialization + business write/read journeys to exact Skill/profile/request facts | real client runs, full `npm run verify`, exact-head CI | verification section and changelog | Evidence is immutable history; no secret or production mutation |

## Detailed File Plan

### New runtime and CLI

- `scripts/client-profile/contracts.ts`
  - TypeScript types and closed runtime validators for both version-1 objects.
  - No permissive unknown-field or implicit-version behavior.
- `scripts/client-profile/canonical-json.ts`
  - Stable key ordering and SHA-256 helpers scoped to public/non-secret objects.
- `scripts/client-profile/safe-files.ts`
  - Regular-file, no-symlink and POSIX permission checks; atomic write and bounded lock.
- `scripts/client-profile/url.ts`
  - HTTPS-origin normalization and explicit loopback-test exception.
- `scripts/client-profile/credential.ts`
  - Environment/file source resolver, forbidden human-control reference names, domain-separated fingerprint and exact-value redaction.
- `scripts/client-profile/http.ts`
  - Bounded fetch wrapper with `redirect: manual`, same constructed origin and sanitized errors.
- `scripts/client-profile/verify.ts`
  - Public connection/OpenAPI projection plus optional synthetic credential evidence.
- `scripts/client-profile/profile-store.ts`
  - Idempotent compare/revalidate/replace lifecycle and revision checks.
- `scripts/client-profile/initialize.ts`
  - Public CLI; never accepts raw token arguments or arbitrary headers/endpoints.
- `scripts/client-profile/create-deployment-handoff.ts`
  - Non-secret release handoff generator from explicit release facts.
- `scripts/client-profile/remove.ts`
  - Explicit local-profile removal only; secret sources are never deleted.

### New Skill

- `skills/idea-validation-init/SKILL.md`
  - Trigger vocabulary for initialization, connection setup, profile update and rotation preparation.
  - Four required inputs and safe token-source instructions.
- `skills/idea-validation-init/agents/openai.yaml`
  - Codex discovery metadata without client-specific behavior forks.
- `skills/idea-validation-init/references/client-connection-profile.v1.schema.json`
  - Canonical closed profile schema.
- `skills/idea-validation-init/references/initialization.md`
  - State flow, commands, validation statuses and idempotent update behavior.
- `skills/idea-validation-init/references/security.md`
  - Secret handling, human-control exclusion, leak response and removal boundary.
- `skills/idea-validation-init/references/client-compatibility.md`
  - Unified Codex, Claude and generic Markdown-Skill loading.

### Existing Skill and gates

- `skills/idea-validation-workflow/SKILL.md`
  - Require profile resolution before AI writes; keep public reads and existing decision loop unchanged.
- `skills/idea-validation-workflow/references/client-setup.md`
  - Replace ad-hoc setup with profile consumption, status interpretation and update/rotation handoff.
- `scripts/lp04/check-skill.ts`
  - Discover and validate both Skill roots, canonical schema links, forbidden raw secrets and human-route instructions.
- `scripts/lp04/check-skill.unit.test.ts`
  - Positive and adversarial fixtures for both Skills.
- `scripts/client-profile/*.unit.test.ts`
  - Targeted contract/security/lifecycle coverage.
- `scripts/client-profile/*.integration.test.ts`
  - Loopback HTTP server, isolated synthetic write and public readback.
- `package.json`, `tsconfig.lp05.json`
  - Add `client:init`, `client:profile:deployment`, `client:profile:remove` and targeted test/typecheck coverage.

### Documentation and evidence

- `README.md`: concise client initialization entry and distinction between public reads, AI writes and human control.
- `docs/operations/lp05.md`: release-bound handoff generation, secure delivery/reference, reuse/rotation and production-authorization boundary.
- `docs/feature/lp-05-client-connection-profile/verification.md`: commands, real-client evidence digests, exact results and deferred production proof.
- `docs/feature/lp-05-client-connection-profile/evidence/*.json`: sanitized Codex/Claude records only after real execution.
- `.gitignore`: local profiles, token files and raw transcripts if existing patterns are insufficient.
- `CHANGELOG.md`: `Added` entry describing initialization Skill and non-secret profile contract.

## Contract Decisions

- Profile version 1 is closed and additive; unknown versions fail closed.
- `IDEA_VALIDATION_AI_TOKEN` is the documented default source name; legacy `AI_API_TOKEN` may be explicitly referenced but is never copied.
- A profile with credential usability `UNVERIFIED` may support public reads but must not be described as authenticated. Business writes can only proceed under explicit user intent and surface auth failure without a success claim.
- Only a real authenticated write and matching public read produces `VERIFIED` usability.
- Automated synthetic writes are loopback-only. Any non-loopback/production write remains externally authorized work.
- Actor mapping is limited to request bodies that already expose `actor`/`proposer`; server-owned attribution is unchanged.
- The deployment handoff generator is separate from the deployment controller to avoid expanding production state-machine authority.

## Acceptance-Criteria Traceability

| AC | Planned proof |
| --- | --- |
| 1–4 | Separate Skill, closed init flow, URL/readiness/OpenAPI integration tests |
| 5–7 | env/file source tests, fingerprint/profile schema and exact leak scans |
| 8–10 | actor mapping fixtures, real readback, server-owned attribution note and human-route negative tests |
| 11–12 | deployment handoff fixtures, reuse/replace/expiry/rotation-state tests and runbook |
| 13–16 | independent status fields, real isolated auth boundary, dual-client proof and deterministic replay |
| 17 | targeted suites, `skill:check`, full verify and exact-head CI |
| 18 | unified install/init/update/rotate/recover/remove docs |
| 19–20 | no production tools invoked; verification and release sections record separate authority |

## Verification

### Targeted during implementation

```text
npx vitest run --config vitest.unit.config.ts scripts/client-profile
npm run skill:check
npm run typecheck:lp05
```

### Integration and client proof

```text
npx vitest run --config vitest.integration.config.ts scripts/client-profile
npm run client:init -- --handoff <synthetic-handoff> --client-id <id> --display-name <name> --credential-env IDEA_VALIDATION_AI_TOKEN --output <temp-profile> --allow-loopback-http --verify-synthetic-write
npm run client:profile:verify-evidence -- <sanitized-records>
```

The Codex and Claude runs execute against an isolated synthetic service and use local ignored transcripts. Committed evidence contains only client/version, exact Skill commit/tree digest, profile digest, request/resource IDs and public read assertions.

### Full gate

```text
npm run verify
git diff --check
git status --short
```

Exact-head GitHub CI must pass before AGILE_REVIEWED Review. No test may weaken secret scans, bearer auth, actor validation or human-control exclusions.

## Rollout

1. Implement CP-01 through CP-03 and pass targeted contract/security tests.
2. Implement CP-04 and pass both-Skill static and profile-consumption tests.
3. Implement CP-05 and document deployment handoff without performing deployment.
4. Run CP-06 isolated Codex/Claude evidence, full verification and exact-head CI.
5. Open/update the feature PR and dispatch one AGILE_REVIEWED code review.
6. After an external merge owner merges the exact reviewed head, reconcile release scope and prepare a new candidate/proposal only under the required later authority.

## Rollback

- Revert the additive runtime, commands, Skill and documentation changes.
- Existing server/API/database/deployment state requires no rollback.
- Local profiles can be explicitly removed; token environment variables/files remain operator-owned and untouched.
- Never delete audit history, production attempts, release records or credential incident records to simulate rollback.

## Compatibility

- Server and OpenAPI remain unchanged.
- Existing public-read workflows remain available.
- Existing AI clients receive a fail-closed initialization instruction before writes rather than an implicit token prompt.
- Profile schema changes require a future new version; version 1 is never silently widened.

## Risks And Controls

| Risk | Control and proving test |
| --- | --- |
| Secret leaks through CLI diagnostics | exact-value canary in stdout/stderr/profile/Git scan |
| Redirect sends bearer to another origin | manual redirect and constructed endpoint tests |
| Profile drift silently reuses proof | explicit replacement/revision tests |
| Public GET masquerades as token validation | wrong-token test retains `UNVERIFIED` and creates nothing |
| Codex/Claude formats diverge | same schema and verifier for both sanitized records |
| Scope expands into deployment changes | no controller edits; separate handoff command and explicit release boundary |

## Documentation And Release Record

- Update the narrowest client and operator docs listed above.
- Add one `CHANGELOG.md` `Added` entry before code review.
- Do not create a tag, package, registry artifact, GitHub Release, production profile or raw-token delivery in this feature run.

## Phase Commit / Push Plan

- F2 design: committed and pushed independently.
- F3 implementation plan: this document in one writer-scoped commit and push.
- F4/F5 implementation and verification: scoped commits as slices complete; all remain on the same feature branch.
- F6 review readiness: final changelog/verification/PR update and exact-head push.

## Open Decisions

None. Any discovered need for a new server auth endpoint, modified actor/report contract, production secret access or release action must return to Requirements rather than being inferred in implementation.
