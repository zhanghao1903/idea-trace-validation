# Initialization

## Required inputs

- A `DeploymentConnectionHandoffV1` JSON file supplied by the deployment
  operator.
- A stable `clientId` matching `^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$`.
- A trimmed, readable `displayName` of 1–120 characters.
- Exactly one secure AI bearer reference: an environment-variable name or an
  absolute restricted regular file.

## Create or revalidate

```bash
npm run client:init -- \
  --handoff /absolute/path/deployment-handoff.json \
  --client-id codex-workstation-01 \
  --display-name "Validation assistant" \
  --credential-env IDEA_VALIDATION_AI_TOKEN \
  --output /absolute/path/client-profile.json
```

Use `--credential-file /absolute/restricted/token-file` instead of
`--credential-env`; never use both. The CLI has no raw-token argument.

The initializer rejects redirects and validates `/health/live`, `/health/ready`,
and `/openapi.json`. A normal run records connection, OpenAPI and credential
presence as verified/present while credential usability remains `UNVERIFIED`.

For an explicitly isolated loopback server only, add
`--allow-loopback-http --verify-synthetic-write`. The initializer then creates
one deterministic synthetic Idea and publicly reads it back. Only an exact
request/readback attribution match records credential usability as `VERIFIED`.

## Update and recovery

- Identical input revalidates without rewriting profile bytes or timestamps.
- Changed origin, release, Skill, attribution, credential reference or
  fingerprint returns `PROFILE_UPDATE_REQUIRED`.
- After confirming the intended change, rerun with `--replace`; the profile
  revision increments atomically.
- A known expired credential returns `CREDENTIAL_EXPIRED` before any write.
- A missing, unreadable or unsafe source returns a bounded non-secret code.
- An auth failure never becomes a verified profile and never weakens bearer or
  human-control boundaries.

Remove only the local profile:

```bash
npm run client:profile:remove -- --profile /absolute/path/client-profile.json
```

The command never deletes the referenced environment value or token file.
