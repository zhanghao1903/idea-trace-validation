# Implementation Plan: LP-05 Production OpenAPI And Connection Handoff Parity Hotfix

- Feature directory: `docs/feature/lp-05-openapi-handoff-hotfix/`
- Branch: `codex/lp-05-openapi-handoff-hotfix`
- Design: `docs/feature/lp-05-openapi-handoff-hotfix/design.md`
- DeliveryMode: `AGILE_REVIEWED`
- Current phase: Plan drafting

## Scope

In scope:

- Hide the six existing SPA shell routes from Fastify Swagger without changing their handlers.
- Extend the static-host test into a production-equivalent complete OpenAPI parity regression.
- Preserve the strict client handoff authority and complete-document digest tests.
- Record implementation/verification and add one `CHANGELOG.md` fixed entry before review.
- After merge, build and verify a new candidate and prepare a new proposal without touching production.

Out of scope:

- Business API, OpenAPI schema, authentication, database, initializer, profile or Skill contract changes.
- Production deployment, production handoff creation/delivery, token access/rotation, tag or publication.
- Migration-ledger and unrelated LP-05 follow-ups.

## Implementation Slices

| Slice | Files/modules | Behavior | Tests and proof | Documentation | Rollback |
| --- | --- | --- | --- | --- | --- |
| HP-01 Web/OpenAPI separation | `apps/api/src/app.ts` | Reuse an immutable `schema: { hide: true }` option for all six shell routes; keep handler and route paths unchanged | Typecheck, API tests, static-host tests | Design implementation note | Revert the route metadata change |
| HP-02 Production-equivalent parity | `apps/api/test/static-host.unit.test.ts` | Start with real non-empty `webDistDir`; compare runtime `/openapi.json` to committed document in full; assert baseline digest, hidden shell paths and all shell responses | Targeted Vitest; negative protection remains in client-profile tests | Verification results | Revert added assertions/fixture reads |
| HP-03 Release record and complete gate | `CHANGELOG.md`, feature verification section or `verification.md` | Record the user-visible initialization blocker fix and exact commands/results | `npm run openapi:check`, targeted tests, client-profile tests, `npm run verify`, `git diff --check` | Changelog plus bounded verification evidence | Revert documentation only if code is reverted |
| HP-04 Review and post-merge preparation | PR metadata; untracked `.lp05-release/` candidate and external proposal record after merge | Submit exact head to Review; after external squash merge, rebuild candidate from merge commit and prepare a new proposal | Exact-head CI; candidate verification against merge commit | PR summary and post-merge traceability | Do not deploy; discard local candidate if proposal is not authorized |

## Detailed File Plan

- `apps/api/src/app.ts`
  - Add one shared route-options constant adjacent to the Web shell handler.
  - Pass it to exactly `/`, `/proposer`, `/executor`, the two project deep links and the confirmation deep link.
  - Do not modify the static plugin, cache headers, handler body, CSP or API registration order.
- `apps/api/test/static-host.unit.test.ts`
  - Load `openapi/lp03.v1.json` from the repository.
  - Fetch `/openapi.json` from the same Web-enabled app already used by static-host regression.
  - Compare full parsed documents and complete canonical digests.
  - Assert the frozen baseline digest and absence of all six Web paths.
  - Exercise all six shell URLs while retaining asset, CSP, cache and 404 assertions.
- `CHANGELOG.md`
  - Add a concise `Unreleased / Fixed` entry describing restored production OpenAPI/handoff parity.
- `docs/feature/lp-05-openapi-handoff-hotfix/`
  - Keep requirements immutable; record implementation and verification in a focused `verification.md` during development.

## Verification

Targeted checks:

```bash
npm run openapi:check
npx vitest run --config vitest.unit.config.ts apps/api/test/static-host.unit.test.ts
npm run test:client-profile:unit
npm run test:client-profile:integration
```

Full gate:

```bash
npm run verify
git diff --check
```

Test oracles:

- Runtime and committed OpenAPI objects are deeply equal under real Web hosting.
- Both complete canonical digests equal the frozen baseline digest.
- Any reintroduced visible shell path fails equality and explicit absence assertions.
- Existing real API mutation tests continue producing different digests.
- Existing matching handoff fixture succeeds and wrong source/digest fixtures fail closed.
- No secret scanner or existing required CI gate is weakened.

Checks intentionally deferred until separate authority:

- New production candidate build and proposal: after authoritative merge commit exists.
- Production deployment and external observation: requires exact per-release authorization.
- Production `DeploymentConnectionHandoffV1` generation/delivery and client initialization: only after successful
  authorized deployment and source/runtime digest equality proof.

## Documentation And Release Impact

There is no public API migration. The release note explains that runtime Swagger no longer includes browser-only
SPA shell routes and that this restores truthful deployment handoff generation. No version, tag, registry,
GitHub Release or Skill publication is prepared by the implementation GoalRun.

## Rollout And Rollback

1. Implement and verify on the exact feature branch.
2. Push and open/update a PR against `codex/v0-1-project-plan`.
3. Obtain one risk-focused `AGILE_REVIEWED` exact-head code review and passing required CI.
4. Wait for an authorized external merge owner under review-only policy.
5. From the authoritative merge commit, build and verify a new `linux/amd64` candidate and prepare a new proposal.
6. Stop before production mutation until the user authorizes that exact proposal.

Rollback uses a code revert before deployment or the existing LP-05 attempt rollback after an independently
authorized deployment. Old candidate/proposal/deployment records remain immutable history.

## Assumptions And Open Decisions

- The six enumerated routes are the complete current Web shell set; the regression will fail if runtime proves
  otherwise.
- `@fastify/swagger` honors Fastify route schema `hide: true`; the production-equivalent test is the authority.
- No open product, API, security or release decision remains. Any need to change a business API or weaken the full
  digest returns to Requirements instead of expanding this plan.
