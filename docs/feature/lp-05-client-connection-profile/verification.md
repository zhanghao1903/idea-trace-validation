# Verification: LP-05 Client Connection Profile

- FeatureId: `lp-05-client-connection-profile-6a2d9f4c1b70`
- DeliveryMode: `AGILE_REVIEWED`
- Confirmed plan: `d7b0b86ac067700b8cbdb6e4534fe1ecd75c94b0`
- Status: Local implementation and evidence verification complete; exact-head CI pending

## Scope boundary

This feature adds local client initialization, non-secret connection artifacts and Skill guidance. It does not
modify the public API, OpenAPI, database, Web application, deployment controller, current production server,
credentials, release attempts or publication state. All write verification uses an isolated loopback service.

## Targeted evidence

| Area | Command / proof | Current result |
| --- | --- | --- |
| Closed contracts, secure source and profile lifecycle | `npm run test:client-profile:unit` | PASS |
| Real HTTP readiness/OpenAPI/auth/write/read boundary | `npm run test:client-profile:integration` | PASS |
| Both Skill roots, local links, human boundary and secret hygiene | `npm run skill:check` | PASS |
| LP-05 and client-profile TypeScript | `npm run typecheck:lp05` | PASS |
| Codex isolated execution | `evidence/codex-e1f0d916.json` | PASS |
| Compatible Markdown-Skill execution | `evidence/compatible-e1f0d916.json` | PASS |
| Sanitized evidence authority | `npm run client:profile:verify-evidence -- docs/feature/lp-05-client-connection-profile/evidence/codex-e1f0d916.json docs/feature/lp-05-client-connection-profile/evidence/compatible-e1f0d916.json` | PASS |
| Full repository gate | `npm run verify` | PASS on the final implementation-and-evidence working tree |
| Exact-head GitHub CI | required checks | Pending push |

## Security assertions

- CLI accepts only an environment-variable name or restricted absolute token file, never raw token arguments.
- Redirects are rejected without following them; endpoints are constructed from one canonical origin.
- Public health/OpenAPI success does not set credential usability to `VERIFIED`.
- Only an authenticated isolated synthetic write plus public attribution readback can set `VERIFIED`.
- Profiles and handoffs contain credential identity/fingerprint only; no bearer, human credential, cookie or
  database connection material is persisted.
- Repeated identical initialization preserves bytes and timestamps. Identity drift requires explicit
  `--replace`; local removal does not delete the credential source.

## Isolated client authority

- Both client journeys used release `isolated-e1f0d91`, profile schema v1, Skill commit
  `e1f0d91656703ecedd031e75376698a58e837998` and Skill-tree digest
  `097d5386052b90612a893d940155df950e9ff98de7cf62d55329b9584aaa051b`.
- Each client loaded the unchanged initialization and business Skill, created its own mode-0600 profile,
  performed a bearer-authorized synthetic Idea write and verified the resource plus `clientId`/`displayName`
  by an unauthenticated public GET.
- Raw profiles, transcripts, handoff and synthetic bearer remain local under `/private/tmp` and are not
  versioned. Exact bearer-byte scans of both raw journeys returned clear before these summaries were added.
- Claude CLI `2.1.220` was unavailable because it was not authenticated, so it is not represented as passing
  evidence. The confirmed `Claude/compatible Markdown-Skill` acceptance path is satisfied by the independent
  reference client record without weakening the shared schema or decision loop.
