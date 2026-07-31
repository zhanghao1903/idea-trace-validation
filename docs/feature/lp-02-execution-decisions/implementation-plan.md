# Implementation Plan: LP-02 项目执行与决策闭环

- Feature directory: `docs/feature/lp-02-execution-decisions/`
- Branch: `codex/lp-02-execution-decisions`
- Requirements: [requirements.md](./requirements.md)
- Design: [design.md](./design.md)
- Current phase: F2/F3 technical plan; implementation is not authorized until exact-plan Review PASS

## 1. Scope

### In scope

- Expand the LP-01 project aggregate from queued/read-only to explicit execution.
- Add transitions, progress, attention items/events, Evidence, conclusion versions and history.
- Add exact, expiring, single-use human confirmation for final/high-impact operations.
- Add an additive PostgreSQL migration and an ordered migration/readiness catalog.
- Extend `/api/v1`, TypeBox contracts, OpenAPI, public projections and stable errors.
- Preserve and regression-test every accepted LP-01 route and data path.
- Produce objective LP-02 acceptance evidence and synchronize the three management documents.

### Out of scope

- Web UI, login/account/RBAC, notifications and generic workflow/approval infrastructure.
- Structured report writes/rendering, Skill, demo orchestration, production deployment or release.
- File upload, URL fetch, object storage or external evidence verification.
- Dependency upgrades, unrelated refactors and destructive/down migrations.

## 2. Preconditions And Stop Conditions

Implementation may start only when:

1. durable workflow stage contains an independent Technical Plan Review `PASS`;
2. the approved plan commit and composite digest exactly match the Review result;
3. branch tip contains the confirmed requirements and approved design/plan;
4. worktree is clean and no unrelated user changes overlap planned files.

Stop and return to planning if:

- Review requires a contract change;
- an implementation step needs Web, identity, deployment, new external service or dependency upgrade;
- a public LP-01 route/field must be removed or silently redefined;
- the migration cannot preserve populated LP-01 rows;
- human confirmation cannot remain separate from AI bearer or raw secrets would enter body/DB/logs;
- a successful command cannot keep business facts, project version, audit and idempotency atomic.

The exact plan commit is carried by the lifecycle review envelope; this document does not hard-code a
self-referential or stale approval SHA.

## 3. Planned Repository Changes

### 3.1 Contracts And OpenAPI

```text
packages/contracts/src/common.ts
packages/contracts/src/projects.ts
packages/contracts/src/project-execution.ts        (new)
packages/contracts/src/progress.ts                 (new)
packages/contracts/src/attention.ts                (new)
packages/contracts/src/evidence.ts                 (new)
packages/contracts/src/conclusions.ts              (new)
packages/contracts/src/confirmations.ts            (new)
packages/contracts/src/index.ts
packages/contracts/test/lp02-api.contract.test.ts  (new)
packages/contracts/test/lp01-compat.contract.test.ts (new)
openapi/lp01.v1.json                               (preserve bytes)
openapi/lp02.v1.json                               (new generated artifact)
scripts/generate-openapi.ts
scripts/check-openapi.ts
scripts/openapi-support.ts
```

TypeBox remains the current API/OpenAPI source. The accepted LP-01 artifact becomes an immutable
compatibility fixture, while LP-02 generation targets a new file.

### 3.2 Domain And Application

```text
packages/domain/src/project.ts
packages/domain/src/project-transition.ts          (new)
packages/domain/src/progress.ts                    (new)
packages/domain/src/attention.ts                   (new)
packages/domain/src/evidence.ts                    (new)
packages/domain/src/conclusion.ts                  (new)
packages/domain/src/confirmation.ts                (new)
packages/domain/src/errors.ts
packages/domain/src/types.ts
packages/domain/src/index.ts
packages/domain/test/project-execution.unit.test.ts (new)
packages/domain/test/confirmation.unit.test.ts      (new)

packages/application/src/ids.ts
packages/application/src/audit.ts
packages/application/src/ports/idea-service.ts      (LP-01 unchanged)
packages/application/src/ports/project-execution-service.ts (new)
packages/application/src/confirmation-capability.ts (new)
packages/application/src/index.ts
packages/application/test/confirmation-capability.unit.test.ts (new)
```

`IdeaService` is not renamed. A separate `ProjectExecutionService` port keeps LP-02 commands/queries
reviewable without changing LP-01 caller signatures.

### 3.3 PostgreSQL Adapter

```text
packages/db/migrations/0002_lp02_execution_decisions.sql (new)
packages/db/migrations/meta/_journal.json
packages/db/src/migrations.ts                       (new ordered catalog)
packages/db/src/migrate.ts
packages/db/src/readiness.ts
packages/db/src/schema/index.ts
packages/db/src/service.ts                          (retain LP-01 behavior)
packages/db/src/services/project-execution-service.ts (new)
packages/db/src/internal/command-transaction.ts     (extract shared idempotency path)
packages/db/src/internal/project-lock.ts            (new)
packages/db/src/index.ts
packages/db/test/migration-lp02.integration.test.ts (new)
packages/db/test/project-execution.integration.test.ts (new)
packages/db/test/confirmation.integration.test.ts   (new)
```

The extraction of the command transaction helper is mechanical and covered by LP-01 replay,
rollback and request-ID regression tests before LP-02 commands use it.

### 3.4 API And Runtime

```text
apps/api/src/config.ts
apps/api/src/logger.ts
apps/api/src/authenticate-human-control.ts          (new)
apps/api/src/confirmation-cookie.ts                 (new)
apps/api/src/errors.ts
apps/api/src/app.ts
apps/api/src/server.ts
apps/api/src/routes/projects.ts
apps/api/src/routes/project-transitions.ts          (new)
apps/api/src/routes/progress-updates.ts             (new)
apps/api/src/routes/attention-items.ts               (new)
apps/api/src/routes/evidence.ts                      (new)
apps/api/src/routes/conclusions.ts                   (new)
apps/api/src/routes/human-confirmations.ts           (new)
apps/api/test/lp01-regression.contract.test.ts       (new)
apps/api/test/lp02-security.contract.test.ts         (new)
.env.example
```

`buildApp` receives both service ports. `PostgresIdeaService` and
`PostgresProjectExecutionService` may share a pool and internal transaction helper but not HTTP
configuration.

### 3.5 Verification And Documentation

```text
apps/api/test/lp02.acceptance.test.ts               (new)
scripts/lp02-acceptance.ts                          (new)
package.json
README.md
CHANGELOG.md
docs/migration-notes.md                             (new)
docs/feature/lp-02-execution-decisions/verification.md (new)
docs/project-management.md
docs/implementation-plans/v0-1/lp-01-core-idea-flow.md
docs/implementation-plans/v0-1/lp-02-execution-decisions.md
```

`npm run test:acceptance` will run both LP-01 and LP-02 acceptance suites; scoped
`test:acceptance:lp01` and `test:acceptance:lp02` commands remain available.

## 4. Implementation Slices

### LP2-S1 — Contract, Domain And Additive Migration Foundation

| Item | Plan |
| --- | --- |
| Behavior | Define controlled values, IDs, field schemas, domain policies and all LP-02 tables/FKs/triggers. Widen project checks without changing existing rows. Replace the single-migration constant with ordered catalog verification. |
| Files | contracts/domain modules, `0002` SQL, Drizzle schema, migration/readiness code |
| Tests | valid/invalid TypeBox fixtures; all state-policy unit cases; migration from populated LP-01 DB; second migration run; checksum/missing/out-of-order readiness; append-only and cross-project constraints |
| Docs | update implementation notes in feature verification draft and migration notes |
| Rollback | code revert only before applying `0002`; after application use forward-fix or restore isolated DB, never drop tables automatically |
| Commit intent | `feat: add LP-02 contracts and persistence foundation` |

Exit gate:

- existing LP-01 migration and data remain byte/row compatible;
- an LP-01 `QUEUED` project reads identically after migration;
- new TypeScript and SQL constraints express every required same-project/append-only invariant;
- no API route is registered yet.

### LP2-S2 — Project Transitions, Evidence And Progress

| Item | Plan |
| --- | --- |
| Behavior | Extract the shared idempotent command transaction, implement project locking/versioning, START/PAUSE/RESUME/CHANGE_PHASE, Evidence create/correct/retract and progress/correction. |
| Files | application port, domain transition/evidence/progress, DB project service/internal helpers, three API route modules |
| Tests | legal/illegal state matrix; phase change; exact one-version increment; Evidence HTTPS/artifact/metric/note validation; no fetch; cross-project/retracted refs; progress replay/conflict/correction; audit/terminal-idempotency rollback |
| Docs | README route summary and migration behavior draft |
| Rollback | all new routes can be removed while additive tables remain unused; no down DDL |
| Commit intent | `feat: add project execution progress and evidence` |

Exit gate:

- LP-01 create/clarify/promote/read regression suite remains green;
- progress changes current next step but never status/phase;
- business fact, project update, audit and idempotency always commit/rollback together;
- failure after fact/project/audit insertion is discriminating and same-key recovery yields one result.

### LP2-S3 — Attention Items, Responses And Historical Reads

| Item | Plan |
| --- | --- |
| Behavior | Implement the three attention discriminators, append-only response/state/correction events, project collection queries and stable cursors. Extend project detail previews from the same query source. |
| Files | attention domain/contract, DB service and queries, attention routes, project route/projection |
| Tests | per-type required fields; OPEN/NEEDS_INFO/RESOLVED/CLOSED matrix; correction leaves originals; proposer/executor agree on IDs/status/version; cursor order and preview truncation; concurrent response conflict |
| Docs | API/migration notes and feature verification draft |
| Rollback | remove route registration; persisted append-only rows remain readable by LP-02 forward-fix |
| Commit intent | `feat: add project attention and history` |

Exit gate:

- blocker resolution, decision response and support response retain original context and all events;
- both role views use one current item state;
- no unbounded array is added to project detail.

### LP2-S4 — Conclusion Versions And Human Confirmation

| Item | Plan |
| --- | --- |
| Behavior | Add conclusion content/state events, human-control authentication, deterministic capability derivation, secure cookie handling, exact summary/digest binding, approve/reject, terminal operations and reopen. |
| Files | conclusion/confirmation domain+contracts, capability helper, DB confirmation service, config/logger/auth/cookie and routes |
| Tests | conclusion revision/supersession; recommendation match; AI/control separation; token inequality config; cookie attributes; raw-secret absence; approve/reject/expire/replay/stale/payload-change; concurrent approval; complete/stop/transfer/reopen history; rollback at every write boundary |
| Docs | security and failure sections in migration notes/README |
| Rollback | no secret recovery is required because plaintext is never stored; pending opportunities may expire; no automatic data deletion |
| Commit intent | `feat: add human-confirmed project conclusions` |

Exit gate:

- only the exact, current, unexpired confirmation can change a conclusion or terminal state;
- AI bearer alone fails both confirmation creation and decision;
- same decision key replays after consumption, while a new key cannot consume again;
- rejection and expiry never make the project terminal;
- reopen returns to `IN_PROGRESS` and preserves prior completion transition/time/conclusion.

### LP2-S5 — Compatibility, Acceptance Evidence And Management Projection

| Item | Plan |
| --- | --- |
| Behavior | Finalize current project projections, LP-02 OpenAPI, LP-01 artifact guard, complete acceptance runner and documentation/status synchronization. |
| Files | project contracts/routes/queries, OpenAPI scripts/artifact, tests, README, changelog, migration notes, verification and three management docs |
| Tests | complete static/build/contract/integration/security/acceptance suite; clean-checkout proof; exact AC-016 scenario; link and OpenAPI drift checks |
| Docs | record commands/results and factual status only |
| Rollback | documentation status remains `In Progress` until all evidence passes; never mark Accepted in implementation |
| Commit intent | `test: prove LP-02 execution decision closure` |

Exit gate:

- `docs/project-management.md` and LP-01 plan show LP-01 `Accepted`,
  `ACCEPTED_NO_PUBLISH`, merge/acceptance/closure IDs and no release artifact;
- LP-02 plan and management index show `Ready for Acceptance` with objective evidence;
- LP-03 remains `Not Started` and receives no implementation/acceptance authority;
- verification text does not claim Review approval, merge or formal acceptance.

## 5. API And Data Delivery Order

1. Add contract/domain types that compile without route registration.
2. Add and verify `0002` against empty and populated LP-01 test databases.
3. Extract shared idempotent transaction behavior and prove unchanged LP-01 results.
4. Implement execution commands and public collection queries.
5. Implement conclusion and confirmation paths.
6. Register routes and generate `openapi/lp02.v1.json`.
7. Run all gates, write objective verification, then update management status.

Code must never be deployed with routes registered against an unrecognized migration; readiness
provides the final fail-closed boundary.

## 6. Command And Transaction Mapping

| Command | Primary record(s) | Project current update | Audit event |
| --- | --- | --- | --- |
| START/PAUSE/RESUME/CHANGE_PHASE | `project_transitions` | status/phase/next step/version | `PROJECT_TRANSITIONED` |
| Create/correct progress | `progress_updates`, Evidence links | latest progress/next step/version | `PROJECT_PROGRESS_RECORDED` |
| Create attention | `attention_items` | version only | `ATTENTION_ITEM_CREATED` |
| Attention event | `attention_events`, item current pointer | version | `ATTENTION_ITEM_UPDATED` |
| Create Evidence | `evidence_items` | version only | `EVIDENCE_RECORDED` |
| Correct/retract Evidence | replacement and/or `evidence_events` | version only | `EVIDENCE_CORRECTED` |
| Create conclusion | content + state event + Evidence links | active conclusion/version | `CONCLUSION_RECORDED` |
| Create confirmation | pending confirmation + pending conclusion state | version; bind resulting version | `CONFIRMATION_REQUESTED` |
| Reject confirmation | decision + conclusion DRAFT state | version | `CONFIRMATION_REJECTED` |
| Approve conclusion | decision + CONFIRMED state | version | `CONCLUSION_CONFIRMED` |
| Approve terminal | decision + conclusion state + transition | status/completion/version | operation-specific terminal event |
| Approve reopen | decision + REOPEN transition | IN_PROGRESS/next step/clear current completion/version | `PROJECT_REOPENED` |

Every row written by a command records or derives the same first-processing `requestId` and resulting
project version. Replay returns the original request ID.

## 7. Verification Matrix

| Acceptance criterion | Automated proof |
| --- | --- |
| LP2-AC-001 | populated LP-01 migration/read/readiness + direct START integration |
| LP2-AC-002 | lifecycle/phase unit matrix + API version-conflict integration |
| LP2-AC-003 | Evidence-backed progress, replay/conflict and no status change |
| LP2-AC-004 | LINK/ARTIFACT/METRIC/NOTE success; non-HTTPS/unknown/cross-project rollback |
| LP2-AC-005 | all attention types, responses, resolve/close and two-view history |
| LP2-AC-006 | two immutable conclusion versions and non-terminal submit |
| LP2-AC-007 | separate credentials, cookie capability, approve/reject/replay |
| LP2-AC-008 | expiry, changed project/conclusion/payload and no partial write |
| LP2-AC-009 | complete/stop/transfer recommendation match and confirmation links |
| LP2-AC-010 | confirmed reopen with old completion/conclusion/history retained |
| LP2-AC-011 | progress/response/Evidence correction and conclusion supersession |
| LP2-AC-012 | failpoints after fact/project/confirmation/audit/idempotency + same-key recovery |
| LP2-AC-013 | proposer/executor authority equality + current OpenAPI contract |
| LP2-AC-014 | invalid credentials, secret redaction/DB scan and input boundaries |
| LP2-AC-015 | exact management-doc assertions |
| LP2-AC-016 | full objective PostgreSQL/API acceptance scenario |

Unit/contract tests may use mocks for pure policy and Schema validation. Transaction, constraints,
concurrency, expiry/consumption and objective acceptance must use an isolated real PostgreSQL 17.10
database.

## 8. Standard Verification Commands

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run openapi:check
npm run test:unit
npm run test:contract
TEST_DATABASE_URL=postgres://.../idea_validation_test npm run db:migrate:test
TEST_DATABASE_URL=postgres://.../idea_validation_test npm run test:integration
TEST_DATABASE_URL=postgres://.../idea_validation_test npm run test:acceptance:lp01
TEST_DATABASE_URL=postgres://.../idea_validation_test npm run test:acceptance:lp02
npm run verify
```

The database scripts may reset only the isolated `TEST_DATABASE_URL`. No test command may drop or
rewrite a shared/production database.

## 9. Security And Failure Proof

Required negative checks are proportional and directly tied to accepted contracts:

- wrong/missing AI token on execution writes;
- wrong/missing human-control token on confirmation creation;
- human-control token equal to AI token causes startup failure;
- missing/wrong/expired capability cookie on decision;
- raw token/cookie not found in DB rows, response body, URL, log capture, error or audit;
- non-HTTPS/user-info LINK, invalid artifact ID and cross-project/retracted Evidence;
- status/phase/recommendation/attention/conclusion state violations;
- same key/different digest and stale expected version;
- concurrent same confirmation and same project writes;
- injected SQL/audit/commit failures with full rollback.

This is not a general mutation harness. Each negative case maps to a requirement, an invariant or a
previously accepted LP-01 behavior.

## 10. Documentation And Changelog

- `README.md`: current scope, config, route families, access separation and verification commands.
- `docs/migration-notes.md`: `0001 -> 0002`, project enum widening, current OpenAPI, client/config
  changes and rollback limits.
- `verification.md`: exact commit/runtime/database scope, commands/results and AC evidence.
- `CHANGELOG.md`: LP-02 user scenario under Unreleased Added/Changed; plan entry under Docs.
- project management/LP plans: update only in LP2-S5 after objective proof, using the exact LP-01
  acceptance identifiers from confirmed requirements.

No document may describe LP-02 as merged, Accepted, published or deployed before the corresponding
authority exists.

## 11. Rollout, Rollback And Recovery

### Rollout

- Apply the exact migration catalog before serving LP-02 routes.
- Readiness stays false until `0001` and `0002` IDs/checksums match.
- No feature flag or dual-write path is required because this is a single-workspace, additive
  pre-production slice.
- Confirmations issued before a process restart remain verifiable because the derivation secret is
  configured and only hashes/inputs are persisted.

### Rollback

- Before `0002`: revert code/branch normally.
- After `0002`: do not run down SQL. Use a forward-fix LP-02 binary or restore an isolated backup.
- A raw LP-01 binary intentionally fails migration readiness against `0002`; this avoids serving a
  database whose schema it cannot attest.
- Existing LP-01 tables/rows remain intact throughout.

### Caller Recovery

- unknown result: retry same idempotency key and identical intent;
- deterministic business rejection: correct facts and use a new key;
- version conflict: refetch, merge intent and use a new key;
- stale/expired/rejected confirmation: create a new exact opportunity from current facts;
- incorrect historical content: append correction/retraction/version, never delete.

## 12. Commit, Push And Review Plan

After exact-plan PASS and durable GoalRun authorization:

1. implement one coherent slice;
2. run its focused tests plus affected LP-01 regressions;
3. update the feature verification carrier;
4. create a slice-scoped commit and push;
5. proceed only while the approved boundary remains unchanged.

After LP2-S5, run the complete verification commands, prepare one PR against
`codex/v0-1-project-plan`, and send the exact head/evidence envelope to independent Review. Main
does not self-approve or merge.

## 13. Risks And Controls

| Risk | Control |
| --- | --- |
| confirmation grows into a user/Web system | API-only control/cookie protocol; no account, page or identity claims |
| AI self-approves | distinct startup-validated secret, separate route, capability cookie |
| a normal record silently changes lifecycle | domain command separation and transition-only state writes |
| parallel state projections diverge | one project row, same query source, role focus only |
| append-only claim is only application convention | SQL triggers/composite FKs plus integration tests |
| migration breaks LP-01 history | immutable `0001`, populated upgrade test, no destructive DDL |
| project detail becomes unbounded | previews plus cursor-paginated collections |
| strict LP-01 clients reject widened enums | new LP-02 artifact and explicit migration note; no silent contract replacement |
| rollback drops new facts | forward-fix/restore only; no down migration |

## 14. Open Decisions

No blocking open decision. Technical Plan Review may require corrections for requirement or
repository inconsistency; it must not add LP-03–LP-05 scope or a general authorization framework.
