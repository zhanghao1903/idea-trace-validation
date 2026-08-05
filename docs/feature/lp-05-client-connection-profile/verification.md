# Verification: LP-05 Client Connection Profile

- FeatureId: `lp-05-client-connection-profile-6a2d9f4c1b70`
- DeliveryMode: `AGILE_REVIEWED`
- Confirmed plan: `d7b0b86ac067700b8cbdb6e4534fe1ecd75c94b0`
- Status: Cycle 1 remediation, refreshed client evidence and final local verification complete; exact-head CI pending

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
| Codex isolated execution | `evidence/codex-8a64e50.json` | PASS |
| Compatible Markdown-Skill execution | `evidence/compatible-8a64e50.json` | PASS |
| Sanitized evidence authority | `npm run client:profile:verify-evidence -- docs/feature/lp-05-client-connection-profile/evidence/codex-8a64e50.json docs/feature/lp-05-client-connection-profile/evidence/compatible-8a64e50.json` | PASS |
| Full repository gate | `npm run verify` | PASS after evidence refresh |
| Exact-head GitHub CI | required checks | Pending push |

## Security assertions

- CLI accepts only an environment-variable name or restricted absolute token file, never raw token arguments.
- Redirects are rejected without following them; endpoints are constructed from one canonical origin.
- Public health/OpenAPI success does not set credential usability to `VERIFIED`.
- Only an authenticated isolated synthetic write plus public attribution readback can set `VERIFIED`.
- A current 401/403 for the same bearer atomically replaces stale `VERIFIED` evidence with `UNVERIFIED`; an
  unknown result exits non-success and never returns the prior proof as a current success.
- The handoff hashes the complete canonical OpenAPI contract and binds every non-secret claim in
  `authoritySha256`. The generator and initializer prove source/Skill commits exist, source OpenAPI matches,
  and the local Skill file set, bytes, modes and version equal `skillCommit` before reading a bearer.
- Profiles and handoffs contain credential identity/fingerprint only; no bearer, human credential, cookie or
  database connection material is persisted.
- Repeated identical initialization preserves bytes and timestamps. Identity drift requires explicit
  `--replace`; local removal does not delete the credential source.

## Isolated client authority

- The immutable Cycle 1 evidence remains versioned as history. The refreshed journeys used release
  `isolated-8a64e50`, profile schema v1, source/Skill commit
  `8a64e50c7f9fa2823ea64fe775e553c4058c55b1` and Skill-tree digest
  `097d5386052b90612a893d940155df950e9ff98de7cf62d55329b9584aaa051b`.
- Each client loaded the unchanged initialization and business Skill, created its own mode-0600 profile,
  performed a bearer-authorized synthetic Idea write and verified the resource plus `clientId`/`displayName`
  by an unauthenticated public GET.
- Raw profiles, transcripts and handoff remain local under `/private/tmp/lp05-client-evidence-cycle2`; the
  pre-existing synthetic bearer remains only in its restricted ignored file. None is
  versioned. Exact bearer-byte scans of both raw journeys returned clear before these summaries were added.
- Claude CLI `2.1.220` was unavailable because it was not authenticated, so it is not represented as passing
  evidence. The confirmed `Claude/compatible Markdown-Skill` acceptance path is satisfied by the independent
  reference client record without weakening the shared schema or decision loop.

## Cycle 1 review remediation

| Finding | Exact regression | Result |
| --- | --- | --- |
| PRR-001 stale credential proof | verified → unknown returns `CREDENTIAL_RESULT_UNKNOWN`; verified → 401 persists/returns `UNVERIFIED` | PASS |
| PRR-002 incomplete OpenAPI projection | request body, referenced components, parameters, security and live served schema drift all change or reject the digest | PASS |
| PRR-003 unbound release/Skill claims | nonexistent source/Skill commit, wrong tree, wrong version and changed release authority stop before synthetic writes | PASS |
