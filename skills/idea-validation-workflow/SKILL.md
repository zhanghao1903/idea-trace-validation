---
name: idea-validation-workflow
description:
  Guide Idea capture, clarification, explicit promotion, project execution
  facts, structured reports, idempotent recovery, role-oriented reads, and
  human-governed handoff through the repository's existing API. Use when a
  proposer or executor asks Codex, Claude, or a compatible client to turn
  natural language into a safe, verified Idea-validation workflow.
---

# Idea Validation Workflow

Use the existing LP-03 REST API as the only business authority. Treat
conversation content as intent and working context, never as current Idea or
project state.

## Run The Decision Loop

1. Classify the request as Idea capture, Idea clarification, explicit promotion,
   execution fact, structured report, role-oriented read, or human-governed
   action.
2. Separate user-supplied facts, labelled hypotheses, and unknowns. Never invent
   a proposer, outcome, evidence, decision, version, or confirmation.
3. Ask one bounded clarification when a required field or explicit high-impact
   intent is missing.
4. Read the current public authority and allowed state immediately before every
   versioned write.
5. Propose the exact existing API action, declared actor attribution, known
   inputs, and expected effect.
6. For an allowed AI write, freeze the method, path, canonical body, and
   deterministic `Idempotency-Key`; send the request with an operator-injected
   AI bearer credential.
7. Recover only under
   [the error and replay rules](./references/error-recovery.md). Never change a
   frozen request while reusing its key.
8. Re-read the public resource after success or replay. Report only the observed
   result, remaining unknowns, and the next allowed step.
9. For human-governed confirmation, explain the public human step and stop. Do
   not request, read, forward, cache, or use a human-control token or capability
   cookie.

## Choose The Existing Workflow

- For Idea capture, clarification, explicit promotion, execution facts, and role
  reads, follow [API workflows](./references/api-workflows.md).
- For structured reports, use
  [structured report guidance](./references/structured-reports.md).
- For credentials, client loading, success evidence, and the human boundary, use
  [client setup](./references/client-setup.md).
- For validation, idempotency, version, readiness, and unknown-result failures,
  use [error recovery](./references/error-recovery.md).

The exact route, request, response, and error authority is
[`openapi/lp03.v1.json`](../../openapi/lp03.v1.json). The exact seven-block
report authority is
[`structured-report.v1.schema.json`](../../packages/contracts/schemas/structured-report.v1.schema.json).
References summarize decisions; they do not replace those artifacts.

## Preserve Authority Boundaries

- Actor and proposer fields declare attribution. They are not authentication or
  permission evidence.
- Proposer/executor Web role selection changes presentation only.
- Use only the existing API; do not call internal services or the database for a
  user workflow.
- Never turn a validation failure, generated text, tool exit code, or local file
  into a success claim.
- Keep bearer credentials outside prompts, repository files, request bodies,
  logs, screenshots, and evidence.
- Preserve append-only history. Corrections and renewed intent use the existing
  correction/revision routes and a new request identity.
- Stop if the frozen public contract cannot express the confirmed intent.
  Explain the gap instead of inventing a route or bypass.
