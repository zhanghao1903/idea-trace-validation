# Changelog

## Unreleased

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
- Add the LP-04 local demo guide and in-progress verification record, with
  explicit synthetic-data, credential, human-handoff and exact cleanup
  boundaries.

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
