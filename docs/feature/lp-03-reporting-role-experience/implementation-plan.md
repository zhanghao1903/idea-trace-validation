# Implementation Plan: LP-03 结构化汇报与双角色体验

- Status: Prepared for Technical Plan Review
- FeatureId: `lp-03-reporting-role-experience-9c4d7e1a6b20`
- Branch: `codex/lp-03-reporting-role-experience`
- Requirements: [requirements.md](./requirements.md)
- Requirements commit: `e8149c722f4c2eb88596fc8a80ab31cfae3bb436`
- Technical design: [design.md](./design.md)
- Technical design commit: `ad296f098ddd01229b9624dd907773297aebd05b`
- Runtime baseline: `644af4f186b054a9c5d1c6db087a97e009f545a3`
- Delivery mode: acceptance-only / no publish unless separately authorized

## 1. Entry Gate And Scope Control

Implementation may start only after Engineering Review returns `PASS` for the exact plan commit and
composite digest. Main then starts one authorized GoalRun for this feature. The implementation branch
remains `codex/lp-03-reporting-role-experience`; no LP-01/LP-02 branch is rewritten.

Before the first code change Main must verify:

```text
git status --short                         # empty
git rev-parse HEAD                         # exact reviewed plan commit
git merge-base --is-ancestor 644af4f... HEAD
workflowctl status                         # feature PLAN_APPROVED / implementation allowed
```

The deliverable is LP-03 only. It excludes accounts/RBAC, LP-04 Skill/demo orchestration, LP-05
deployment/release, general editing, remote content fetch, arbitrary report components, project-state
mutation from reports and lifecycle authorization tooling.

Superdesign remains a non-authoritative UI reference. Its required login attempt expired during plan
drafting, so no canvas ID or generated artifact is claimed. It may be retried only in a later explicit
user-authorized interaction. If used before Web coding, the approved requirements and design are the
prompt authority; because `apps/web` does not yet exist, use the brand-new-project path and do not run
`init`. Once real `apps/web` source exists, any later Superdesign iteration must first complete all six
`.superdesign/init/` analysis files. Failure or absence of Superdesign does not relax API, security,
accessibility or acceptance gates.

## 2. Dependency And Compatibility Lock

Install exact versions and commit the resulting `package-lock.json`. These versions were checked
against the npm registry while drafting this plan; all support Node 24.

| Package | Exact version | Workspace / purpose | Compatibility condition |
| --- | --- | --- | --- |
| `ajv` | `8.20.0` | `packages/reporting` structural validation | strict Draft 2020-12 mode |
| `ajv-formats` | `3.0.1` | `packages/reporting` RFC 3339/date-time | peer `ajv ^8` |
| `json-schema-to-ts` | `3.1.1` | contracts/reporting type derivation | build-time only, Node >=16 |
| `mdast-util-from-markdown` | `2.0.3` | safe Markdown AST parsing | no HTML renderer dependency |
| `react`, `react-dom` | `19.2.8` | `apps/web` | exact matching pair |
| `react-router-dom` | `7.18.2` | URL role/resource routing | React >=18, Node >=20 |
| `vite` | `8.2.0` | Web build/dev | Node >=22.12 includes Node 24 |
| `@vitejs/plugin-react` | `6.0.5` | Vite React compilation | Vite ^8 |
| `@fastify/static` | `10.1.2` | same-origin built assets | Fastify 5-compatible major |
| `@types/react` | `19.2.18` | Web typecheck | React 19 |
| `@types/react-dom` | `19.2.4` | Web typecheck | React DOM 19 |
| `@testing-library/react` | `16.3.2` | component acceptance | React 18/19 |
| `@testing-library/dom` | `10.4.1` | accessible queries | peer of Testing Library React |
| `@testing-library/user-event` | `14.6.1` | keyboard/control behavior | Testing Library DOM >=7.21 |
| `jsdom` | `29.1.1` | component DOM | Node >=24.0; deliberately not jsdom 30 |
| `@playwright/test` | `1.62.1` | Chromium browser acceptance | Node >=20 |

Use `--save-exact`; do not broadly upgrade existing dependencies. Add only required build-script
allowlist entries. After install run `npm ls --all`, `npm audit --omit=dev` as an informational check,
and the complete existing verification before feature code. A conflicting peer/engine result blocks
implementation and requires a plan revision rather than `--force` or `--legacy-peer-deps`.

## 3. Slice 1 — Canonical Schema, Types And Pure Report Package

### 3.1 Files

- Update `packages/contracts/schemas/structured-report.v1.schema.json`:
  - correct Evidence prefix from unimplemented `evi_` to accepted LP-02 `evd_`;
  - retain Draft 2020-12, v1 root, seven block types and all confirmed bounds;
  - add no transport/runtime-only response fields to the submission document.
- Add `scripts/generate-report-types.ts` and `scripts/check-report-types.ts`.
- Add generated `packages/contracts/src/generated/structured-report.v1.ts` and export it from
  `packages/contracts/src/index.ts`.
- Add report response/error/experience TypeBox DTOs in:
  - `packages/contracts/src/reports.ts`
  - `packages/contracts/src/experience.ts`
  - `packages/contracts/src/lp03-routes.ts`
- Add `packages/reporting/package.json`, `tsconfig.json` and:
  - `src/schema.ts`
  - `src/types.ts`
  - `src/errors.ts`
  - `src/canonical-json.ts`
  - `src/markdown.ts`
  - `src/validate.ts`
  - `src/compile.ts`
  - `src/index.ts`
  - corresponding `test/*.unit.test.ts` fixtures.
- Update root `package.json`, `tsconfig.json`, ESLint/Vitest configs and lockfile for the workspace and
  `report-types:generate` / `report-types:check` commands.

### 3.2 Implementation Rules

1. Compile the checked-in JSON Schema through Ajv 2020 strict mode with `allErrors` and formats.
2. Convert Ajv paths into sorted JSON Pointers, deduplicate and cap at 50 without values.
3. Run separate semantic checks for unique section/block/item IDs, table column/cell equality, finite
   numbers, blank strings and internal complexity.
4. Parse Markdown AST and allow only the nodes in design section 4.2. Validate `https:` links with no
   userinfo. Unknown/dangerous nodes return `REPORT_UNSAFE_CONTENT` before compilation.
5. Canonicalize validated JSON deterministically and compute SHA-256 excluding only
   `clientRequestId`. Preserve array order and every content string.
6. Compile to a frozen discriminated render model of safe scalar/tokens and stable reference IDs.
   Do not emit HTML strings or component names.

### 3.3 Slice Gate

```text
npm run report-types:check
npm run test:contract -- packages/contracts/test/report-schema.contract.test.ts
npm run test:unit -- packages/reporting/test
npm run typecheck
npm run build
```

Negative tests include unknown root/block fields, all seven block bounds, malformed tables, duplicate
IDs, NaN/infinite metrics, `evi_` rejection, cross-protocol fields, HTML/script/style/SVG/iframe,
Markdown images/code blocks, `javascript:`/`data:`/HTTP/userinfo links, whitespace-only labels and
more than 50 errors.

## 4. Slice 2 — Additive Persistence And Report Transaction

### 4.1 Files

- Add `packages/db/migrations/0003_lp03_reporting_experience.sql` and journal entry.
- Update `packages/db/src/schema/index.ts`, `packages/db/src/migrations.ts` and migration checksum
  fixtures.
- Add application contracts:
  - `packages/application/src/ports/report-service.ts`
  - report IDs in `packages/application/src/ids.ts`
  - report audit type/event in `packages/application/src/audit.ts`
  - exports from `packages/application/src/index.ts`.
- Add `packages/db/src/report-service.ts` and
  `packages/db/test/report-service.integration.test.ts`.

### 4.2 Migration Contract

Create `project_reports`, `report_revisions`, and `report_submission_keys` exactly as design section
5. Add foreign keys, workspace/project uniqueness, revision/pointer checks, accepted timestamps and
an update/delete rejection trigger on revision rows. Extend audit controlled values only with
aggregate `REPORT` and event `REPORT_REVISION_ACCEPTED`; preserve all LP-01/LP-02 rows and values.

Migration verification starts from a populated LP-02 database and proves old IDs, versions, history,
confirmations and read projections are unchanged. Running migration twice follows existing migration
runner semantics and does not duplicate objects or data.

### 4.3 Transaction Contract

Implement one transaction with fixed lock order:

1. claim/lock `(workspaceId, projectId, clientRequestId)`;
2. replay completed same digest, reject different digest, or wait at most two seconds for owner;
3. lock project and stable report aggregate; reject completed project;
4. compare `basedOnRevision` and batch-check Evidence/Attention ownership;
5. insert immutable revision and compiled model;
6. update accepted/renderable pointers;
7. append redacted report audit event;
8. persist exact success replay and commit.

Add deterministic failpoints after revision insert, pointer update and audit insert. Every failpoint
must roll back all four durable effects and allow the same key/content to succeed later. Concurrent
tests use two independent DB connections and prove one revision/result.

### 4.4 Slice Gate

```text
npm run db:migrate:test
npm run test:integration -- packages/db/test/report-service.integration.test.ts
npm run test:integration
npm run test:acceptance:lp01
npm run test:acceptance:lp02
```

## 5. Slice 3 — Report HTTP Contract And API Composition

### 5.1 Files

- Add `apps/api/src/routes/reports.ts` and `apps/api/test/lp03-report-api.acceptance.test.ts`.
- Update `apps/api/src/app.ts` to register routes, inject the report service, skip trim normalization
  for this body and apply only this POST route's 262,144-byte limit.
- Update `apps/api/src/errors.ts`, `apps/api/src/config.ts`, `apps/api/src/logger.ts` only where needed
  for stable codes/redaction; old mappings remain.
- Update `scripts/generate-openapi.ts`, `scripts/check-openapi.ts`, `scripts/openapi-support.ts` and add
  `openapi/lp03.v1.json` plus frozen digest tests.

### 5.2 Routes And Behavior

Implement the four report routes in design section 6.1. POST requires AI bearer and matching
header/body request identity. GET routes are public read but readiness-gated. Current read returns
explicit `EMPTY | CURRENT | FALLBACK | UNSUPPORTED`, accepted/rendered revision identities, safe
render model and batch-hydrated reference DTOs. History uses existing signed/opaque cursor conventions
and a stable `(revision DESC, report_id)` order.

Do not pass POST through global `trimJsonStrings`. Do not increase global `bodyLimit`. Map JSON parse,
size, schema, safety, reference, idempotency, stale revision, frozen project and readiness failures to
the exact codes in design section 6.3. Logs and errors omit body/cookie/bearer and offending values.

### 5.3 Slice Gate

```text
npm run openapi:generate
npm run openapi:check
npm run test:acceptance:lp03
npm run test:contract
npm run test:acceptance:lp01
npm run test:acceptance:lp02
```

## 6. Slice 4 — Authoritative Experience Projections

### 6.1 Files

- Add `packages/application/src/ports/experience-query-service.ts`.
- Add `packages/db/src/experience-query-service.ts` and integration tests.
- Add `apps/api/src/routes/experience.ts` and API acceptance tests.
- Reuse existing cursor, project detail and collection services; do not widen or reimplement frozen
  LP-01/LP-02 DTO behavior.

### 6.2 Query Rules

Implement the three experience routes from design section 6.2. Proposer category is calculated in a
single authority query from Idea plus unique linked project and clarification state. Every Idea enters
exactly one category. Executor `OPEN` is `QUEUED | IN_PROGRESS | PAUSED`; `COMPLETED` is separate.

Batch-load preview facts to avoid N+1 queries: latest progress, current next step, open blockers,
decision/support requests, pending confirmations and latest confirmed conclusion. Every card includes
authoritative ID/version/update time and links to full cursor collections. No derived category or
role-specific object is persisted.

### 6.3 Slice Gate

```text
npm run test:integration -- packages/db/test/experience-query-service.integration.test.ts
npm run test:acceptance:lp03
npm run test:contract
npm run typecheck
```

Fixtures cover every proposer category, open/completed executor grouping, no-data previews, more than
one page, stable cursor ordering and equality of IDs/versions across both views and old APIs.

## 7. Slice 5 — Web Shell And Role Overview Pages

### 7.1 Files

- Add `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` and source entry.
- Add `apps/web/src/app/router.tsx`, layout, role switch, API client, query hooks, design tokens and
  global CSS.
- Add proposer/executor overview pages, card/filter/pagination components, state components and
  component tests.
- Add a dedicated `vitest.web.config.ts` and include Web typecheck/build in root scripts.

If the user has successfully reauthorized Superdesign before this slice, create its non-authoritative
base draft before source code. Otherwise implement directly from confirmed requirements/design. Once
the first real `apps/web` files exist, any later Superdesign use must run its full init analysis before
iteration. No generated artifact is copied blindly; accessibility, responsive behavior and security
are independently verified.

### 7.2 Behavior

Implement `/proposer` and `/executor`. URL path owns role and query parameters own filter/cursor.
Role switch changes the path, has no auth semantics and remains keyboard accessible. Pages distinguish
initial loading, pagination loading, empty, 404/not-found, API/readiness failure and labelled stale
content. They do not use localStorage/sessionStorage for domain data.

Cards render the server category/group and authority fields without recomputation. Wide layouts use
readable grid/list structure; narrow layout becomes one column without hiding next step, blockers or
status text.

### 7.3 Slice Gate

```text
npm run typecheck --workspace @idea/web
npm run build --workspace @idea/web
npm run test:web:component -- role-overviews
npm run lint
```

## 8. Slice 6 — Project Detail, Seven Renderers And Scoped Confirmation

### 8.1 Files

- Add proposer/executor project detail route components and shared fixed-authority sections.
- Add seven report block components, safe Markdown-token renderer, reference cards, report revision
  labels and dynamic-region error boundary.
- Add confirmation page/API client that consumes only the existing scoped HttpOnly cookie.
- Update `apps/api/src/app.ts` for `@fastify/static`, known-route SPA fallback and CSP headers.
- Add component tests for every block, fallback, confirmation and security boundary.

### 8.2 Behavior

Both project detail paths fetch the same authority/project version. They differ only in presentation
ordering. The authority header and execution collections live outside the dynamic error boundary.
Report components switch only on seven controlled types and render text nodes/safe tokens; no raw
HTML, `dangerouslySetInnerHTML`, remote embed, dynamic import or project-specific component dispatch.

On dynamic exception, show a fixed safe notice and render the API-provided prior render model. Label
its actual revision and the accepted revision it replaces. Without fallback show report empty/
compatibility state while keeping project facts usable.

`/confirmations/:confirmationId` calls existing LP-02 confirmation reads/decision routes. It never
receives a token in URL/JavaScript, never sets a broader cookie and exposes no unrelated write form.
Approve/reject, declared actor and bounded note follow the frozen LP-02 contract. Invalid/expired/
stale/consumed capability cannot appear successful.

### 8.3 Slice Gate

```text
npm run test:web:component
npm run build --workspace @idea/web
npm run test:acceptance:lp02
npm run lint
```

Static-host tests prove `/api/*` never receives SPA HTML, deep links receive the app shell, assets are
immutable/cacheable, CSP forbids inline/eval/object/frame content and no secret is logged or rendered.

## 9. Slice 7 — Browser Acceptance And CI

### 9.1 Files

- Add `playwright.config.ts` and `apps/web/e2e/*.spec.ts`.
- Add deterministic LP-03 API/browser fixture setup in `scripts/acceptance-lp03.ts` or scoped helpers.
- Update root scripts and `.github/workflows/ci.yml` to install matching Playwright Chromium and run
  the LP-03 browser job against PostgreSQL/API/Web.

### 9.2 Browser Matrix

1. Seed all proposer categories and executor groups; paginate beyond the first page.
2. Submit two valid reports with different sections, types and order; render all seven types through
   the same component set.
3. Reject unsafe/invalid/cross-project content and prove report count/current pointer unchanged.
4. Navigate proposer → project → executor role, refresh, back/forward and open both direct deep links.
5. Use only keyboard to switch role, filter, paginate, open project and decide a scoped confirmation;
   assert visible focus and semantic labels.
6. Run at desktop and narrow viewport and assert no core control/content is obscured.
7. Induce a deterministic dynamic-render test fault for newest revision and prove authority remains,
   safe notice appears and prior revision renders; prove safe empty state with no prior revision.
8. Exercise API unavailable, readiness failure, 404, empty and pagination failure as distinct states.
9. Inspect DOM/URLs/browser console/server logs for absence of capability, bearer, cookie, connection
   string, source-danger text, raw HTML and executable elements.

### 9.3 Slice Gate

```text
npx playwright install chromium
npm run test:browser
npm run verify
```

CI must run the exact locked Node/npm versions, PostgreSQL migration, existing suites, Web build and
browser acceptance. It uploads only ordinary test diagnostics; traces/screenshots must not contain
secrets and are disabled for capability-bearing success paths unless redacted.

## 10. Slice 8 — Documentation, Management Facts And Verification Record

### 10.1 Files

- Add `docs/feature/lp-03-reporting-role-experience/verification.md` with commands, timestamps and
  objective result summaries.
- Update `README.md`, `CHANGELOG.md`, `docs/migration-notes.md`, current OpenAPI usage and
  `docs/feature/v0-1-project-plan/structured-report-protocol.md` compatibility decisions.
- Update `docs/project-management.md` and
  `docs/implementation-plans/v0-1/lp-02-execution-decisions.md` with exact LP-02 facts:
  - merge `644af4f186b054a9c5d1c6db087a97e009f545a3`;
  - `ACCEPTED_NO_PUBLISH`;
  - acceptance `b63ec86101008217bfa6eab6bbeda41713735e7099b051a2a7e21f3026321cba`;
  - closure `418d1de3689d1bef9a1ce3ee2abf88cb3e44cd1976dc3ec40c2e15f7b63d5061`;
  - release targets `[]`.
- Update `docs/implementation-plans/v0-1/lp-03-reporting-role-experience.md` to
  `Ready for Acceptance` with actual PR/head/check/verification references available at that stage.

LP-03 must not be labelled `Accepted`, published, released or deployed. LP-04 stays `Not Started` and
unconfirmed. Do not record future or placeholder evidence as completed fact.

### 10.2 Final Verification

```text
git diff --check
npm ci
npm run db:migrate:test
npm run report-types:check
npm run openapi:check
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:acceptance:lp01
npm run test:acceptance:lp02
npm run test:acceptance:lp03
npm run test:web:component
npm run test:browser
npm run verify
git status --short
```

`npm run verify` is the final aggregate and must include the relevant commands rather than merely
coexisting with them. A passing suite on a commit other than the PR head is stale evidence and must be
rerun.

## 11. Pull Request And Review Flow

1. Keep commits scoped by slices; preserve the reviewed requirements/design/plan commits.
2. Push the implementation branch and create/update one PR targeting
   `codex/v0-1-project-plan` at the then-current canonical base.
3. Record exact base SHA, head SHA, verification commands and CI URLs in `verification.md` and PR.
4. Reload durable status, prepare `CodeReviewRequest` for the exact head, send its raw envelope to the
   configured Engineering Review task and mark it dispatched.
5. On `REQUEST_CHANGES`, change only the implementation branch, rerun proportionate/full checks,
   regenerate exact-head evidence and request re-review. Main never self-approves.
6. Review does not merge under review-only policy. After exact-head approval and external merge,
   Review independently records authoritative merge proof.
7. Because this feature has no publish target, user may later authorize the formal
   acceptance-only/no-publish transition for the exact merge commit. Do not tag, create a Release,
   deploy, or mark complete before that transition succeeds.

## 12. Rollback And Recovery

- Before merge: revert or supersede defective slice commits; never rewrite confirmed requirements or
  immutable review records.
- After application rollback: the LP-02 binary can run against the additive LP-03 schema; report
  routes/Web are absent and old API behavior remains.
- Never roll back by deleting report revisions, report history, audit events or the migration row.
- A bad accepted report is corrected by a new revision. Unsupported compiler/protocol content falls
  back explicitly; it is not silently rewritten.
- Dependency/build failure restores the last known lockfile through a normal revert commit, not
  `git reset --hard`.
- Database or test fixture failure uses the existing test database lifecycle and transaction cleanup;
  production-like data destruction is outside this plan.

## 13. Acceptance Trace And Evidence Owner

| Acceptance criterion | Primary slices | Required evidence |
| --- | --- | --- |
| LP3-AC-001 | 2–4, 7 | populated migration + frozen LP-01/LP-02 contract/acceptance |
| LP3-AC-002 | 1–3 | schema/semantic unit + API revision persistence |
| LP3-AC-003 | 2, 4, 6 | ownership integration + fixed authority browser assertion |
| LP3-AC-004 | 2–3 | replay/conflict/concurrency/failpoint integration |
| LP3-AC-005 | 2–3, 6 | complete/reopen/history/compatibility tests |
| LP3-AC-006 | 1, 6–7 | seven-component DOM and two-report browser scenario |
| LP3-AC-007 | 3, 6–7 | dynamic fault fallback with preserved authority |
| LP3-AC-008 | 4–5, 7 | all-category paginated proposer scenario |
| LP3-AC-009 | 4–5, 7 | executor grouping and cross-view authority equality |
| LP3-AC-010 | 5–7 | URL switch/refresh/history/deep-link browser scenario |
| LP3-AC-011 | 3–7 | no-report detail with complete authority collections |
| LP3-AC-012 | 6–7 | public denial/scoped cookie decision and secret absence |
| LP3-AC-013 | 5–7 | keyboard semantics, focus and narrow viewport |
| LP3-AC-014 | 1–7 | boundary failpoints, DB assertions, DOM/log secret scans |
| LP3-AC-015 | 8 | exact management fact contract test and review |
| LP3-AC-016 | 1–8 | principal full E2E plus complete `npm run verify` |

Engineering Main owns implementation and evidence preparation. Engineering Review independently
checks the exact plan/PR heads and old findings. An external authorized merge owner owns merge; the
user owns any later acceptance-only/no-publish authorization.
