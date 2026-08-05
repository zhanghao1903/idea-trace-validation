# Client Setup And Evidence

## Initialized profile

- Use `$idea-validation-init` to create a validated `ClientConnectionProfileV1`
  before an AI write. The canonical schema is
  [`client-connection-profile.v1.schema.json`](../../idea-validation-init/references/client-connection-profile.v1.schema.json).
- Resolve `baseUrl`, `openapiUrl`, `releaseId`, `clientId`, `displayName` and
  the credential source reference from that profile. Reject an unknown version,
  invalid fields, release/Skill mismatch, known expiry or unsafe credential
  source.
- A profile with credential usability `UNVERIFIED` is not an authenticated
  success. Surface the status and let an actual authorized write fail closed.
- Map `clientId` to existing request-body `client` and `displayName` to existing
  declared display attribution only where the current OpenAPI permits it.

## Credentials

- Resolve the AI bearer from the profile's environment-variable or restricted
  absolute file reference, not the prompt or repository.
- Never print request headers, bearer values, cookies, environment dumps, or
  credential-bearing URLs.
- Human-control token and scoped confirmation cookie are never Skill inputs.
  Explain the public human step and stop.

## Client Loading

- Codex: invoke `$idea-validation-init` once for local setup, then invoke this
  repository Skill as `$idea-validation-workflow`. Keep the exact Skill Git
  commit and tree digest in the acceptance record.
- Claude or another compatible Markdown-Skill client: load this folder without
  changing `SKILL.md`, and use the same initializer/profile contract;
  client-specific setup must not fork the decision loop.

## Objective Evidence

Record the client/version, execution surface, exact Skill commit, synthetic
input intent, sanitized request IDs, live-readable resource IDs, relevant Web
paths, and objective checks. Keep raw transcripts local and ignored; commit only
their digest and sanitized verification facts.

A static answer, mock response, missing API request IDs, unavailable live
resources, or absent client execution is not a compatibility pass.
