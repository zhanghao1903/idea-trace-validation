# Changelog

## Unreleased

### Fixed

- Bind both LP-05 production identity readers to the configured PostgreSQL
  principal and separate the strict application rollback projection from
  attempt-bound cleanup evidence. Fresh-install recovery now removes only empty,
  exact attempt-owned container/network/volume identities, preserves upgrade and
  foreign resources, and fails closed on any authority drift. Forward restore
  cleanup now reaches a digest-bound `CLEANED` lifecycle before returning and is
  safely reused by later rollback without deleting the same resources twice.

### Docs

- Reorganize the v0.1 roadmap into five lightweight implementation plans that
  can be accepted independently, with one concise project-management index.
- Define the implementation-ready LP-01 technical design for the core Idea
  create, clarify, promote, and read flow.
- Define the implementation-ready LP-02 technical design for project execution,
  append-only evidence/history, versioned conclusions, and scoped human
  confirmation.
- Define the LP-03 technical design for immutable structured-report revisions,
  safe generic rendering, and the proposer/executor Web experience.
- Define the implementation-ready LP-04 design for a client-neutral AI Skill,
  deterministic synthetic demos, real HTTP recovery proof, and exact
  Codex/Claude validation evidence.
- Add the LP-04 local demo guide and immutable verification record, with
  explicit synthetic-data, credential, human-handoff and exact cleanup
  boundaries.
- Define LP-05's release-candidate, deployment authorization, backup/isolated
  restore, rollback, public re-smoke and immutable evidence contracts, with a
  versioned single-server operations runbook.

### Added

- Add the reproducible Node.js 24/npm workspace, TypeBox contracts, generated
  OpenAPI, strict configuration, health/readiness behavior, and CI gates.
- Add PostgreSQL 17 persistence, the LP-01 migration, global idempotency,
  optimistic concurrency, append-only audit history, and exact readiness
  checksum verification.
- Add public Idea/project reads and authenticated create, clarification, and
  explicit promotion commands with proposer/executor projections.
- Add unit, contract, PostgreSQL integration, concurrency, security, and
  end-to-end LP-01 acceptance verification.
- Add LP-02 project transitions, append-only progress, three attention-item
  classes, Evidence metadata and correction histories.
- Add immutable conclusion versions and separate human-control confirmation for
  conclusion approval, completion, stop, transfer and reopen operations.
- Add the additive LP-02 migration, current project execution projections,
  stable historical reads and an independently generated LP-02 OpenAPI artifact.
- Add transaction failpoint, confirmation security, operation-matrix and
  end-to-end LP-02 acceptance verification.
- Add the canonical LP-03 structured-report types, strict schema/semantic/safe
  Markdown compiler and immutable report revision persistence.
- Add report submit/current/history/revision APIs, authoritative proposer and
  executor experience projections, and the independently generated LP-03 OpenAPI
  artifact.
- Add the React proposer/executor Web, project details, seven controlled report
  renderers, scoped confirmation page and strict same-origin static hosting.
- Add component and Chromium acceptance coverage for role URLs, pagination,
  narrow screens, capability isolation, render fallback and failure states.
- Add the client-neutral `idea-validation-workflow` Skill and bounded references
  for existing API workflows, structured reports, idempotent recovery, client
  loading and the human-governed stop boundary.
- Add deterministic synthetic manifests, canonical request identities, durable
  request journals, fail-closed run records and a real HTTP demo/verification
  runner without introducing a second business state store.
- Add a separate explicit-opt-in human facilitator for owned synthetic
  environments; human-control material remains outside AI inputs and evidence.
- Add cross-process unknown-result recovery, exact body/key replay, public
  uniqueness reconciliation and real-data proposer/executor Chromium coverage.
- Add independently verified Codex CLI and Claude Desktop/Claude Code Skill
  execution records, bound to exact transcript digests and publicly readable
  synthetic API resources without committing credentials or raw transcripts.
- Add a digest-pinned multi-stage application image, private PostgreSQL network,
  Caddy HTTPS edge, read-only/non-root runtime and repository-outside secret
  injection for the LP-05 production candidate.
- Add fail-closed deployment authorization and attempt-state tooling, encrypted
  streaming backups, seven-copy retention, isolated restores, credential
  rotation, rollback, smoke/evidence verification and local production-topology
  acceptance coverage.
- Extend exact-head CI with the LP-05 immutable-candidate build, static release
  validation, authority/restore/rotation/rollback tests and clean-tree proof.

### Changed

- Move the structured-report v1 JSON Schema into `packages/contracts/schemas` as
  its single canonical location and update all documentation links.
- Reuse Fastify's request-scoped ID across LP-01 logs, responses, idempotency
  and audit, add post-mutation rollback evidence, and enforce the configured
  shutdown deadline for lingering requests or resources.
- Widen the LP-01 project authority from `PLANNING / QUEUED / version=1` to the
  bounded LP-02 phase and lifecycle state machines while preserving existing
  objects and routes.
- Require a distinct 32-byte base64url `HUMAN_CONTROL_TOKEN`; store only
  confirmation capability hashes and return raw capabilities through scoped
  secure cookies.
- Keep the LP-01 OpenAPI artifact immutable by pinned digest and generate the
  LP-02 and LP-03 expanded contracts as independently pinned artifacts.
- Compile dynamic report content into frozen safe tokens and keep every project
  authority field outside the dynamic render boundary.
- Close the public safe-token contract recursively at every nesting depth and
  expose the same component through generated OpenAPI.
- Preserve the exact LP-02 migration ledger while tracking LP-03 in a strict
  feature ledger, so the accepted LP-02 binary remains a tested application
  rollback target after the additive upgrade.
- Bind LP-04 client proof to the exact raw transcript, closed POST request
  claims, exact authoritative event-to-operation mappings, client-observed
  request/response facts and derived objective checks; correlate the Codex
  timeout/replay tuple and response-file request ID to the same accepted claim;
  bind `jq`, its request-ID selector, the exact response-file input and output
  to one parsed command segment, then parse jq option arity so only a true
  positional input or selector-bound `--slurpfile` can satisfy response-file
  proof; require per-child public readback and preserve resumable journal state
  after bounded `IDEMPOTENCY_IN_PROGRESS` retries.
- Make LP-05 external smoke an active observer, require authority-bound evidence
  at every persisted deployment transition, execute idempotent host rollback,
  and derive `pg_restore` connectivity only from a live re-inspected isolated
  target.
- Remove caller-authored future evidence from the LP-05 production controller;
  actively execute and reconcile controller-owned phase outputs, recover stale
  locks through an exclusive bounded-resume lease, run restore inside the exact
  re-inspected isolated DB container after complete production-identity checks,
  and require exact same-host HTTPS redirects plus the production CSP.
- Make LP-05 post-phase authority/deadline failures durably terminal without
  authorizing new forward work, abort backup/restore child pipelines at the
  attempt deadline, bind runtime inputs across restarts, and clean exact
  isolated-restore resources through a persisted crash-safe lifecycle.
- Join every LP-05 forward actor before terminal rollback, propagate its
  cancellation signal through nested Docker commands, and require a persisted
  restore `QUIESCING` phase with consecutive empty observations before recording
  `CLEANED`.
