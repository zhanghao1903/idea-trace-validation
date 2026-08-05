# Client Compatibility

Codex, Claude and compatible Markdown-Skill clients use the same handoff,
profile schema, commands and business decision loop.

## Codex

Load `$idea-validation-init`, establish the local profile, then load
`$idea-validation-workflow`. Keep the exact Skill commit/tree digest in
sanitized compatibility evidence.

## Claude and compatible clients

Install or load this Skill directory without rewriting `SKILL.md`. Execute the
same repository CLI outside the model prompt so the raw credential remains in
secure runtime configuration. Then load the unchanged `idea-validation-workflow`
Skill.

## Evidence

Keep raw transcripts local and ignored. A sanitized record may contain only the
client/version, exact Skill commit and tree digest, profile digest, release and
credential IDs, request/resource IDs, declared attribution and public-read
result. It must never contain token bytes, Authorization headers, cookies,
private request content or production write claims.
