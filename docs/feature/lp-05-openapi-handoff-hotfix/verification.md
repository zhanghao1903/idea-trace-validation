# Verification: LP-05 Production OpenAPI And Connection Handoff Parity Hotfix

- FeatureId: `lp-05-openapi-handoff-hotfix-8d3f6a1c2e90`
- DeliveryMode: `AGILE_REVIEWED`
- Plan authority: `9cd4c3999a56ff8e67161bae709d1e02b6e02a2bedf870a56af582c840238df7`
- Plan commit: `f87d33cad747d38e498416071c0da8143a651f54`
- Verification scope: local implementation and isolated production-equivalent fixtures only

## Implementation Result

- All six SPA shell registrations use one `schema: { hide: true }` route option.
- Their paths, shell handler, `cache-control`, CSP, static asset and 404 behavior are unchanged.
- A Web-enabled app with a real non-empty temporary `webDistDir` now returns a runtime OpenAPI document deeply
  equal to committed `openapi/lp03.v1.json`.
- Both complete canonical documents retain digest
  `5b2cbcd605e9a8304e1f22e331b36b67c54b1976d49a499af31ed6a8e0d6adb7`.
- The committed OpenAPI file, business API, database, authentication, initializer, profile, handoff and Skill
  contracts were not changed.

## Automated Results

| Command | Result |
| --- | --- |
| `npx vitest run --config vitest.unit.config.ts apps/api/test/static-host.unit.test.ts` | PASS — 1 file, 1 production-equivalent test |
| `npm run openapi:check` | PASS — LP-01/LP-02 immutable digests and LP-03 generated document current |
| `npm run typecheck` | PASS |
| `npm run test:client-profile:unit` | PASS — 13 tests |
| `npm run test:client-profile:integration` | PASS — 5 real localhost HTTP tests |
| `npx prettier --check apps/api/src/app.ts apps/api/test/static-host.unit.test.ts CHANGELOG.md` | PASS |
| `npm run verify` | PASS — complete required repository gate |

The first sandboxed client-profile integration attempt could not bind `127.0.0.1` (`listen EPERM`) and timed
out. It was rerun unchanged in the approved isolated localhost execution environment and passed 5/5. This was an
execution-environment restriction, not a product failure.

The complete `npm run verify` result includes:

- formatting, lint, Skill, report-type, TypeScript and build checks;
- OpenAPI generation parity;
- 172 unit, 23 contract, 36 integration, 8 Web component and 13 acceptance tests;
- 103 deployment unit tests, LP-05 release-readiness and real Docker hotfix acceptance;
- 13 client-profile unit and 5 client-profile integration tests;
- 7 primary browser journeys and the LP-04 browser journey.

## Acceptance Trace

| Acceptance | Evidence |
| --- | --- |
| AC-01/02 | Baseline digest is asserted; Web-enabled runtime and frozen documents are deeply equal and digest-equal |
| AC-03/04 | Six shell URLs return the shell; CSP, cache, asset and unknown-route assertions pass |
| AC-05/06/07 | `openapi:check` and complete-object equality pass; existing schema/component/parameter/security mutation tests remain green |
| AC-08/09 | Existing handoff fixture generates a schema-valid non-secret envelope; source/Skill mismatch tests remain green; no bearer is read |
| AC-10 | Targeted tests and full required gate pass |
| AC-11 | Current production release and mismatch facts remain append-only below; no production file or state was modified |
| AC-12/13/14 | Candidate, proposal, deployment, production observation and production handoff are explicitly deferred to separate authority |

## Preserved Production Facts

As observed before implementation:

- Current production release: `lp05-d181bf9a02a8-amd64`.
- Current deployed source authority: `d181bf9a02a8c47da909050faa213fbc5efb71e7`.
- Frozen canonical OpenAPI digest: `5b2cbcd605e9a8304e1f22e331b36b67c54b1976d49a499af31ed6a8e0d6adb7`.
- Observed production runtime digest: `5166c611797bb7be6fe6dc1964831c02aa6d27a1d1d460e4747556a2112bdb09`.
- Handoff generation failed closed with `SOURCE_OPENAPI_MISMATCH`; no production handoff was created.

This implementation does not relabel the existing deployment as fixed. A new candidate must be built from the
future authoritative merge commit, and production deployment requires a new exact proposal and explicit user
authorization. Only a successfully deployed and independently observed matching runtime may produce a production
`DeploymentConnectionHandoffV1`.
