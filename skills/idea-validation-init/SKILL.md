---
name: idea-validation-init
description:
  Initialize, validate, update, or remove a non-secret IdeaTrace client
  connection profile for Codex, Claude, or compatible Markdown-Skill clients.
  Use when a user needs to configure the IdeaTrace website address, secure AI
  bearer reference, stable clientId, displayName, release binding, or recover
  from profile and credential configuration errors before using the business
  workflow Skill.
---

# Idea Validation Init

Establish client connection configuration only. Do not perform Idea, project,
report, human-confirmation, deployment, release, or credential-rotation actions.

## Initialize A Client

1. Obtain a non-secret `DeploymentConnectionHandoffV1` from the deployment
   operator. Treat its release, OpenAPI and credential identity as claims that
   the initializer must verify.
2. Require a stable `clientId` and a human-readable `displayName`. Explain that
   both are declared attribution, not authentication or permission evidence.
3. Ask for the name of an environment variable or the absolute path of a
   restricted local token file. Never ask the user to paste a raw bearer into
   the conversation, CLI arguments, stdin, logs, screenshots or repository.
4. Run `npm run client:init` with the handoff, attribution, secure source and an
   absolute output path. Follow [initialization](./references/initialization.md)
   for exact commands and lifecycle behavior.
5. Report the non-secret profile ID, release ID and the four independent
   validation states. Never describe `UNVERIFIED` credential usability as an
   authenticated success.
6. Load `$idea-validation-workflow` only after the profile passes its required
   read/write gate. Public reads remain available without a bearer.

## Preserve Security Boundaries

- Refuse `HUMAN_CONTROL_TOKEN`, confirmation cookies, capability material,
  passwords, database URLs and credential-bearing URLs as inputs.
- Never follow redirects. Never send a bearer to a caller-selected path or a
  different origin.
- Use `--verify-synthetic-write` only for an explicitly isolated loopback
  service. Production writes require separate authority and are outside this
  Skill.
- Use `--replace` only after the operator explicitly accepts a changed origin,
  release, Skill, attribution or credential identity.
- Remove only the local profile. Never delete, revoke, generate or rotate the
  referenced secret.

Read [security](./references/security.md) for incident and human-boundary rules,
[client compatibility](./references/client-compatibility.md) for Codex/Claude
loading, and the canonical
[profile schema](./references/client-connection-profile.v1.schema.json) when
validating or transporting a profile.
