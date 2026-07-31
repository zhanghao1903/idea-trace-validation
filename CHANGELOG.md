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

### Changed

- Move the structured-report v1 JSON Schema into `packages/contracts/schemas` as
  its single canonical location and update all documentation links.
- Reuse Fastify's request-scoped ID across LP-01 logs, responses, idempotency
  and audit, add post-mutation rollback evidence, and enforce the configured
  shutdown deadline for lingering requests or resources.
