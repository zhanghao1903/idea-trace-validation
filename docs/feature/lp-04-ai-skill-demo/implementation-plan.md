# Implementation Plan: LP-04 AI Skill 与可重复演示

- FeatureId: `lp-04-ai-skill-demo-5f8c2a9d7e41`
- Branch: `codex/lp-04-ai-skill-demo`
- Authoritative baseline: `818671c504c8b8b8cd41f8ebc096f341ece6b18f`
- Requirements authority: `40e0edb4da153fbe9bc0c90edb0a39d9b085a520`
- Design commit entering F3: `02bf25cd121f9c5033a4e6454d69f64d48fe82b0`
- Requirements: [requirements.md](./requirements.md)
- Design: [design.md](./design.md)
- Current phase: F3 — Implementation planning
- Delivery mode: acceptance-only / no publish unless separately authorized after merge

## 1. Entry Gate And Scope Control

### 1.1 Development Authority

This document does not authorize implementation by itself. Main may start an initial GoalRun only after Engineering
Review returns PASS for the exact plan commit and composite digest. Until then, changes stay limited to requirements,
design, implementation plan and the required plan-phase release record.

The implementation Goal must preserve these invariants:

- no modification to LP-01–LP-03 runtime API, OpenAPI, database, domain or Web behavior;
- no human confirmation action by the AI Skill;
- no non-loopback automated demo write;
- no direct service/database call as core demo evidence;
- no generated secret, token, raw transcript or local proof in Git;
- no static-only Codex/Claude compatibility claim;
- no LP-05 deployment, release or production work.

If the existing public API cannot complete a confirmed scenario, stop the Goal, record the exact request/response and
return to Requirements. Do not patch earlier public contracts under LP-04 authority.

### 1.2 Package Workflow Gate Classification

- Task type: behavior, Skill/docs, tests, repository scripts and acceptance evidence.
- Affected runtime packages: none by design.
- Public surface: repository Skill instructions, demo CLI commands and evidence format; existing REST surface is
  consumed unchanged.
- Safety impact: bearer handling, human handoff, deterministic replay and isolated demo guard.
- Required release record: `CHANGELOG.md` under `Added`, `Tests` and/or `Docs` before PR review.
- Product-specific computer-use package gate: not applicable; this is a Node/PostgreSQL product repository rather
  than the macOS computer-use package suite.

### 1.3 Allowed And Forbidden Paths

Expected implementation paths:

- `skills/idea-validation-workflow/**`;
- `demo/lp04/**`;
- `scripts/lp04/**`;
- `apps/api/test/lp04-demo.acceptance.test.ts`;
- `apps/web/e2e/lp04-demo*` and `playwright.lp04.config.ts`;
- `package.json`, `.gitignore`, `README.md`, `CHANGELOG.md`;
- `docs/demo/lp04.md`, this feature directory, `docs/project-management.md` and the LP-04 source plan.

Forbidden without a new confirmed requirements handoff:

- `packages/domain/src/**`, `packages/application/src/**`, `packages/db/src/**`, migrations;
- `packages/contracts/src/**`, `packages/contracts/schemas/**`, `openapi/**`;
- `apps/api/src/**`, `apps/web/src/**`;
- deployment, release workflow, version, tag or package-publishing files.

Test-only setup may import existing packages and connect to the exact isolated test database. Business setup and
proof still use the listening HTTP API.

## 2. Dependency And Compatibility Lock

### 2.1 Frozen Inputs

| Artifact | Baseline SHA-256 | Use in LP-04 |
| --- | --- | --- |
| `openapi/lp01.v1.json` | `528ff0f42a576791a9e370ac80d8b865b1ed0bca456a7d964c2d4743cd566a05` | Regression-only frozen contract |
| `openapi/lp02.v1.json` | `0c23e1de55fe3e011d7ab17949c28037f1704816756e2ec7838da9244208cf1c` | Regression-only frozen contract |
| `openapi/lp03.v1.json` | `fe853576812ae5d133f6d2880c3b2d3cb07de3f7dbe49471953d4bb6105cd18c` | Skill/demo route and error authority |
| `packages/contracts/schemas/structured-report.v1.schema.json` | `d8481678f881103c053a4362ec8b533714265960f1b2b41c0e9d42507e4e955a` | Report fixture authority |

Final verification reruns `npm run openapi:check` and asserts no diff from the authoritative baseline under all
forbidden runtime paths. Digest values are plan evidence; existing generators/checkers remain contract authority.

### 2.2 Dependency Strategy

- Use Node.js 24 built-ins (`fetch`, `node:http`, `node:crypto`, `node:fs`) and already locked TypeBox, Vitest and
  Playwright dependencies.
- Add no npm dependency and therefore no package-lock change.
- Use installed Skill Creator `init_skill.py` in Slice 1 with explicit repository output and interface values. Do not
  copy its absolute machine path into committed files.
- Use a small repository `skill:check` for CI-portable structural hygiene. It is not an authorization-grade semantic
  validator and cannot replace actual client/API acceptance.

## 3. Slice 1 — Skill Scaffold, Core Workflow And Static Contract

### 3.1 Files

- `skills/idea-validation-workflow/SKILL.md`
- `skills/idea-validation-workflow/agents/openai.yaml`
- `skills/idea-validation-workflow/references/api-workflows.md`
- `skills/idea-validation-workflow/references/error-recovery.md`
- `skills/idea-validation-workflow/references/structured-reports.md`
- `skills/idea-validation-workflow/references/client-setup.md`
- `scripts/lp04/check-skill.ts`
- `scripts/lp04/check-skill.unit.test.ts`
- `scripts/lp04/skill-openapi.contract.test.ts`
- `package.json` (additive `skill:check` command)

### 3.2 Scaffold And Content Rules

1. Run Skill Creator `init_skill.py idea-validation-workflow --path skills --resources references` with generated
   OpenAI interface values. Remove unused placeholder/example files.
2. Keep `SKILL.md` below 500 lines and imperative. Frontmatter contains only `name` and `description`.
3. Put trigger coverage in the description: Idea capture/clarification/promotion, project execution facts,
   structured reports, idempotent recovery and human handoff.
4. Keep the cross-intent decision loop in the main body:
   `classify → separate facts/hypotheses/unknowns → read → propose → execute/handoff → verify → explain`.
5. Link every detailed reference directly from `SKILL.md`; do not create a second hidden instruction level.
6. Reference the frozen OpenAPI and canonical report JSON Schema for full fields. Examples may show bounded request
   fragments but cannot become copied canonical schemas.
7. State that actor/role body fields are declared attribution, Web role is presentation, and neither is identity.
8. Treat confirmation create/decision endpoints as human-only context. Never instruct the client to read or send
   human-control credentials or a capability cookie.

### 3.3 CI Hygiene Checker Contract

`check-skill.ts` performs only narrow deterministic checks:

- folder/name/frontmatter and required `name`/`description`;
- local Markdown reference existence and one-level topology;
- required canonical OpenAPI/Schema links;
- route/error identifiers used by the Skill exist in the frozen LP-03 artifacts;
- no literal secret, bearer/cookie assignment, credential-bearing URL or generated placeholder;
- no main-body instruction designates human-only routes as an AI action.

It does not parse all Markdown semantics, simulate Lifecycle authorization or prove a client followed the Skill.
Engineering Review and real client/API runs own those judgments.

### 3.4 Tests, Gate And Rollback

- unit-test frontmatter/link failures, stale route/error references, secret fixtures and a forbidden human-action
  fixture;
- contract-test referenced methods/paths/error codes against `openapi/lp03.v1.json`;
- run Skill Creator `quick_validate.py` when available and record it only in verification;
- run `npm run skill:check`, unit/contract tests and `git diff --check`.

Commit and push Slice 1 after all references resolve, existing tests pass and no runtime-contract file changed.
Rollback is a commit revert; no runtime/persisted state exists. Trace: AC 1, 3–9, 15–17.

## 4. Slice 2 — Synthetic Manifest, Deterministic Runtime And Local Evidence

### 4.1 Files

- `demo/lp04/scenario.v1.json`
- `demo/lp04/reports/active-project.v1.json`
- `demo/lp04/reports/completed-project.v1.json`
- `scripts/lp04/contracts.ts`
- `scripts/lp04/canonical-json.ts`
- `scripts/lp04/request-identity.ts`
- `scripts/lp04/environment.ts`
- `scripts/lp04/http-client.ts`
- `scripts/lp04/run-record.ts`
- `scripts/lp04/scenario.ts`
- `scripts/lp04/run.ts`
- `scripts/lp04/verify-run.ts`
- matching `*.unit.test.ts` files
- `.gitignore` (`.lp04-demo/` only)
- `package.json` (`demo:lp04`, `demo:lp04:verify`)

### 4.2 Tooling Contract

Implement the design matrices exactly:

- strict `DemoScenarioManifestV1` with unknown-field rejection and bounded counts;
- `DemoRunRecordV1` with legal transitions and atomic ignored-file replacement;
- deterministic `req_` identity from versioned run ID, manifest digest, step and semantic attempt;
- typed HTTP results that retain frozen request bytes in memory until success or final stop;
- a redactor given the exact runtime AI token that rejects evidence containing it;
- cursor iteration with duplicate detection and 100-page ceiling.

The runner accepts explicit safe arguments:

```text
npm run demo:lp04 -- --base-url http://127.0.0.1:<port> --run-id <safe-id> --skill-commit <sha>
```

Read AI token only from `AI_API_TOKEN`. Refuse userinfo, non-loopback hosts, URL path/query/hash, missing synthetic
marker, manifest/Skill digest conflicts or non-ready API. Never accept a database URL or human credential.

### 4.3 Scenario Expansion And Replay

Replace only declared placeholders: run label, API IDs, current version and report request identity. Canonicalize the
expanded body before its first write and retain those bytes for replay. A same-run restart fails before write if its
recomputed body differs from the local record.

Through public reads and AI write routes, create/replay a clarification Idea, promoted/in-progress project, progress,
blocker, decision request, support request, Evidence, conclusion, rejected/corrected report and the report side of a
second project later completed by the separate facilitator.

### 4.4 Tests, Gate And Rollback

- deterministic identity goldens and changed-intent separation;
- canonical manifest/digest and placeholder validation;
- loopback acceptance plus remote/userinfo/path rejection;
- run lifecycle and same-run conflict;
- secret/redaction and evidence-size bounds;
- HTTP policy through a local non-business server;
- report templates against canonical report Schema after expansion.

Run targeted tests, `skill:check`, typecheck, lint and `git diff --check`; commit and push Slice 2. Rollback reverts the
commit and may remove only exact local `.lp04-demo/runs/<runId>` evidence, never API records. Trace: AC 2, 7–13,
16–17.

## 5. Slice 3 — Real HTTP Acceptance, Unknown Result And Human Facilitator

### 5.1 Files

- `scripts/lp04/unknown-result-proxy.ts`
- `scripts/lp04/human-facilitator.ts`
- `scripts/lp04/verify-client-evidence.ts`
- `apps/api/test/lp04-demo.acceptance.test.ts`
- `package.json` (`demo:lp04:human`, `test:acceptance:lp04`, `demo:lp04:verify-client`)

### 5.2 Real HTTP Topology

The acceptance test may instantiate existing services only to start the exact Fastify application against isolated
`TEST_DATABASE_URL`; call `app.listen({host: "127.0.0.1", port: 0})`. All scenario creation, mutation and
verification uses `fetch` to that port. Direct service/database calls cannot replace core assertions.

Test cleanup may truncate only after verifying `NODE_ENV=test`, loopback host, a database name ending `_test`, and
the exact URL used by the test pool. Demo runtime contains no truncate/drop/reset code.

### 5.3 Unknown-Result And Report-Correction Proof

Configure one `UnknownResultFaultPlan`. The proxy matches method/path/key digest, forwards unchanged, waits for the
upstream response, drops downstream bytes once, then permits direct identical retry. Assert replay metadata and
exactly one collection/history result. Counter-fixtures prove changed body/same key conflicts and version conflict
causes a re-read plus new key.

Submit one invalid report, capture stable bounded path error and prove current revision unchanged. Correct from known
manifest/API facts, use a new matching header/body identity and prove exactly one accepted revision. Do not add a
general mutation harness.

### 5.4 Separate Human Facilitator

`human-facilitator.ts` is not an AI Skill action. It requires explicit
`--allow-human-control-for-synthetic-demo`, loopback URL, existing synthetic run record and environment-injected
`HUMAN_CONTROL_TOKEN`. It re-reads exact project/version, uses the existing confirmation/capability flow, never logs
token/cookie, discards the cookie and verifies final public state. A negative acceptance proves AI bearer alone cannot
use the human route or mutate the project.

### 5.5 Client Evidence Validator

Validate `ClientValidationRecordV1`, exact Skill ancestor/tree equality, transcript digest, sanitization and every
resource through public HTTP. Emit committed JSON only after all checks pass. A hand-written assertion without live
request/resource correlation cannot become PASS.

### 5.6 Gate And Rollback

Run LP-04 real HTTP acceptance plus LP-01, LP-02 and LP-03 acceptance against the same isolated test database, then
unit/contract gates. Commit and push only after discriminating unknown-result, correction and human-boundary proof.
Rollback reverts Slice 3; it adds no migration or runtime route. Trace: AC 2, 5–13, 16–17.

## 6. Slice 4 — Real-Data Proposer/Executor Browser Story

### 6.1 Files

- `playwright.lp04.config.ts`
- `apps/web/e2e/lp04-demo.setup.ts`
- `apps/web/e2e/lp04-demo.spec.ts`
- `package.json` (`test:browser:lp04`)

### 6.2 Topology And Behavior

- Build the existing Web without changing source.
- Start the existing API on a dedicated loopback port with `WEB_DIST_DIR=apps/web/dist`, so API and Web are
  same-origin.
- Global setup runs/replays one synthetic demo and prepares the completed fixture in the test-only facilitator role.
- Do not call `page.route` or mock `/api` in the LP-04 spec.
- Locate records by exact synthetic run label; verify the same Idea/project IDs appear in proposer and executor views
  with role-specific emphasis.
- Open details and verify two differently structured reports use the existing generic renderer.
- Verify pending human context is visible but no public write control or credential is exposed.

This is an additive dedicated Playwright configuration. Existing LP-03 browser tests remain unchanged.

### 6.3 Gate And Rollback

Run build, existing `test:browser`, and new `test:browser:lp04` against the isolated database. Verify no screenshot,
trace or test-results artifact is staged; commit and push. Rollback reverts only the dedicated config/spec/scripts.
Trace: AC 10, 13–14, 16–17.

## 7. Slice 5 — Actual Codex And Claude Validation

### 7.1 Preconditions And Evidence Owners

- Main owns the exact Skill commit, isolated API/demo environment and evidence validator.
- The user/acceptance operator owns making authenticated Codex and Claude client surfaces available; Main does not
  install clients, acquire accounts or expose credentials.
- The observed client process/session owns the actual HTTP actions.
- Main validates/commits sanitized records; Review independently reconciles artifacts and public IDs.

Before either run, commit and push every final Skill correction. Record that commit and do not change the Skill tree
afterward without invalidating and rerunning both proofs.

### 7.2 Representative Runs

- **Codex:** capture an incomplete synthetic Idea, preserve unknowns, create/read it, then recover one
  unknown-result replay without duplication.
- **Claude:** read/promote an explicitly ready synthetic Idea, record one execution fact and submit/correct a report,
  stopping before the human boundary.

Use separate run IDs. Both may make extra reads; neither receives human credentials. Raw transcripts remain ignored
and are scanned with exact in-memory secrets before evidence emission.

### 7.3 Record, Failure Semantics And Gate

Record client/version, execution mode, observer, exact Skill commit, transcript digest, exact synthetic input,
request IDs, resource IDs, Web paths and objective checks. The verifier proves the recorded commit is an ancestor,
its Skill tree equals current head, and every resource is live, synthetic and consistent.

If a client/session is absent, authentication fails, Skill was not loaded, HTTP was not called, or resources cannot
be re-read, leave that AC failed. Do not create PASS. Missing Codex or Claude proof blocks Goal completion unless
Requirements is revised.

Run the evidence verifier for Codex and Claude, rerun committed records in read-only mode, scan diffs/raw ignored
artifacts for secrets, and rerun Skill/unit/contract/HTTP gates. Commit only two sanitized evidence files and any
separately reviewable verifier fix, then push.

Rollback reverts evidence without changing runtime; synthetic records remain labelled. Trace: AC 1–9, 15–17.

## 8. Slice 6 — Documentation, Management Facts And Final Verification

### 8.1 Files

- `README.md`
- `docs/demo/lp04.md`
- `docs/feature/lp-04-ai-skill-demo/verification.md`
- `docs/project-management.md`
- `docs/implementation-plans/v0-1/lp-04-ai-skill-demo.md`
- `CHANGELOG.md`
- `package.json` (final `verify` integration if not already complete)

### 8.2 Documentation Truth Rules

The manual demo guide includes prerequisites, isolated safety check, placeholder-only credential injection, Codex
and Claude Skill loading, start/replay, both role journeys, human handoff, failure recovery, expected API/Web output
and exact local/owned-environment cleanup. It never prescribes shared/production destructive cleanup.

Project management and source plan update atomically:

- LP-03 becomes `Accepted` with merge `818671c504c8b8b8cd41f8ebc096f341ece6b18f`, acceptance ID
  `7f8aeac9327278dc08bd84d2f229ebc9f6b166a109e4a7c83a0001a49bf7ce8b` and closure ID
  `25fd479b6c7663d41920bc50935c5bd1fd5efb7f2d4a3e14252015a889e360f8`, targets `[]`;
- LP-04 becomes `Ready for Acceptance` with then-current exact PR/head/check/verification evidence;
- LP-04 acceptance record remains `None`, explicitly not formal acceptance;
- LP-05 remains `Not Started` and unconfirmed.

`CHANGELOG.md` records Skill, deterministic real-HTTP demo/client evidence and docs under `Added`, `Tests` and
`Docs`. Do not create a version/tag section.

### 8.3 Final Verification Matrix

Run and record:

```text
npm run format:check
npm run lint
npm run skill:check
npm run typecheck
npm run build
npm run openapi:check
npm run test:unit
npm run test:contract
TEST_DATABASE_URL=<isolated-test-url> npm run test:integration
TEST_DATABASE_URL=<isolated-test-url> npm run test:acceptance:lp01
TEST_DATABASE_URL=<isolated-test-url> npm run test:acceptance:lp02
TEST_DATABASE_URL=<isolated-test-url> npm run test:acceptance:lp03
TEST_DATABASE_URL=<isolated-test-url> npm run test:acceptance:lp04
npm run test:web:component
npm run test:browser
TEST_DATABASE_URL=<isolated-test-url> npm run test:browser:lp04
npm run verify
```

Also verify both client records read-only, frozen artifact digests, forbidden runtime-path diff, `git diff --check`,
tracked-file secret absence and complete requirements trace. Do not write `Ready for Acceptance` if any mandatory
check or client proof is unavailable.

### 8.4 Gate And Rollback

Commit/push final docs, changelog and verification. Re-run complete verification on that exact head; refresh through
a new commit, never amend stale authority. Rollback reverts docs; runtime still needs no migration. Trace: AC 1–18.

## 9. Commit And Push Plan

Use narrow commits and push after each completed slice:

1. `feat(lp04): add client-neutral workflow Skill`
2. `feat(lp04): add deterministic synthetic demo runtime`
3. `test(lp04): verify real HTTP recovery and human boundary`
4. `test(lp04): add real-data dual-role browser story`
5. `test(lp04): record Codex and Claude Skill evidence`
6. `docs(lp04): record verification and acceptance readiness`

Do not amend referenced commits. Stage only slice files and inspect the cached diff. Push after every slice so client
and Review evidence can bind to immutable commits.

## 10. Pull Request And Engineering Review

After the implementation Goal is genuinely complete:

1. confirm no Goal work remains and finish the GoalRun through platform/Lifecycle authority;
2. create/update one PR from `codex/lp-04-ai-skill-demo` to `codex/v0-1-project-plan`;
3. describe problem, solution, unchanged runtime contract, tests, client proof, docs/changelog, rollback and
   no-publish impact;
4. wait for exact-head GitHub checks;
5. prepare exact `CodeReviewRequest` through `workflowctl` and send unchanged to Review;
6. remediate blocking/major findings in a new GoalRun and request fresh exact-head review;
7. never self-approve or self-merge.

Review inspects full diff, validates client evidence against exact Skill/current head, reproduces representative
HTTP/browser proof and confirms no forbidden runtime contract or secret entered the PR.

## 11. Rollout, Merge And Acceptance

LP-04 has no publication target. Review approval only makes the exact PR head merge-ready for the external merge
owner. After authoritative merge proof, Main presents exact merge, no-publish reason and acceptance authority. Only a
separate explicit user authorization may record `ACCEPTED_NO_PUBLISH` and close LP-04.

Do not tag, create GitHub Release, publish package/Skill marketplace entry, deploy or start LP-05 automatically.

## 12. Evidence Authority And Completion Condition

| Evidence | Owner | Required authority |
| --- | --- | --- |
| Requirements/design/plan | Main + Engineering Review | Exact commits/digests and PASS plan result |
| Skill/demo implementation | Main GoalRun | Pushed commits and clean exact head |
| HTTP/browser/CI checks | Main + GitHub Actions | Exact commands/status, no mocked core path |
| Codex run | Actual Codex session + observer | Version, exact Skill commit, transcript digest, live resource re-read |
| Claude run | Actual Claude session + observer | Version, exact Skill commit, transcript digest, live resource re-read |
| Human boundary | Facilitator test/operator | Separate credential path, public final read, zero secret output |
| Code approval/merge | Review / external merge owner | Exact reviewed head, green checks and merge proof |
| Formal acceptance | User in Main task | Explicit exact-merge no-publish authorization |

The implementation Goal is complete only when all six slices are committed/pushed, both actual client records pass,
all regression gates pass on exact head, docs/changelog/management are truthful, a PR exists and no in-scope work
remains. Review approval, merge and post-merge acceptance occur afterward and are not self-claimed.

## 13. Plan-Time Open Decisions

None. Client availability is an external execution precondition, not a design choice. An unavailable client is a
blocker rather than a reason to use a mock or static response.
