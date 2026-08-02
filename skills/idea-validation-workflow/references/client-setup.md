# Client Setup And Evidence

## Credentials

- Receive the API base URL and AI bearer credential from secure operator
  configuration, not the prompt or repository.
- Never print request headers, bearer values, cookies, environment dumps, or
  credential-bearing URLs.
- Human-control token and scoped confirmation cookie are never Skill inputs.
  Explain the public human step and stop.

## Client Loading

- Codex: invoke this repository Skill as `$idea-validation-workflow` and keep
  the exact Skill Git commit in the acceptance record.
- Claude or another compatible Markdown-Skill client: load this folder without
  changing `SKILL.md`; client-specific setup must not fork the decision loop.

## Objective Evidence

Record the client/version, execution surface, exact Skill commit, synthetic
input intent, sanitized request IDs, live-readable resource IDs, relevant Web
paths, and objective checks. Keep raw transcripts local and ignored; commit only
their digest and sanitized verification facts.

A static answer, mock response, missing API request IDs, unavailable live
resources, or absent client execution is not a compatibility pass.
