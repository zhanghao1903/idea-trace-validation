# PR #7 Engineering Review — Cycle 2

- Repository: `zhanghao1903/idea-trace-validation`
- Pull request: <https://github.com/zhanghao1903/idea-trace-validation/pull/7>
- Base: `codex/v0-1-project-plan` at `46e021d261fd8a663c83430a551f5674365ccf14`
- Previous reviewed head: `8dc99e295b9021f6123c027092b4f57600cc964f`
- Reviewed head: `codex/lp-05-deployment-release` at `7e31f4829d3691bb1c20fa7417f68add0cfbf3eb`
- Reviewed tree: `ab4b707d8ddc8d8bb09509bc5c547389139b168e`
- Reviewed at: `2026-08-03T01:16:32Z`
- Decision: **REQUEST_CHANGES**
- Merge status: **NOT_READY** (`review-only`; Review did not merge)

## Outcome

Cycle 2 materially improves the implementation and fully closes the original external observation-import forgery.
`deploy:lp05:smoke -- --observations` can no longer mint an external record, the certificate contract is bound to
the exact host/time, state projections are strict, and deployment/rollback entrypoints plus live restore inspection
now exist.

Three blockers remain on the exact head:

1. `deploy:lp05` still treats a caller-supplied complete evidence bundle as every production “oracle”; a reviewer
   bundle containing only hand-written canonical records reached `DEPLOYED` with zero external mutation calls;
2. the restore guard derives the connection from `isolatedTarget`, but it does not prove that the database socket
   belongs to the inspected Compose container and it compares against unchecked caller production metadata;
3. the required CSP is absent, while smoke accepts any 3xx as the HTTP redirect without checking `Location`.

GitHub CI is green, but its current 41 LP-05 tests do not reject these counterexamples.

## Previous finding closure

### PRR-001 — Resolved

`scripts/lp05/smoke/run.ts:25-70` now rejects every external `--observations` import and routes external requests to
the active observer. Certificate host and observation-time validation is implemented and covered by exact-head
negative tests. This fingerprint is no longer blocking.

### PRR-002 — Open

The null-projection/state-shape bypass from Cycle 1 is fixed, but the required action was broader: the production
controller had to execute and re-read the live deployment phases. It still does not.

### PRR-003 — Open

Independent `PGHOST/PGPORT/PGDATABASE` environment authority is removed, but the current live checks can combine
Compose labels from one project with the PostgreSQL system identity from an unrelated loopback socket. Production
identity is still caller-provided and not closed/actively inspected before mutation.

## Blocking findings

### PRR-002 — Production controller replays caller evidence without executing deployment (S1)

Location: `scripts/lp05/deploy/evidence-oracles.ts:95-199`

`controller-cli.ts` parses `request.evidence`, validates that the bundle is internally self-consistent, then creates
all forward oracles from that same object. Those oracles do not invoke preflight, backup, migration, Compose,
readiness, external smoke, isolated restore or production-before/after inspection; they only parse and project JSON.

Reviewer constructed a complete authority-shaped bundle with canonical smoke, backup, restore, migration and phase
records. Running it through `createEvidenceOracles` and `runDeployment` produced:

```json
{"currentState":"DEPLOYED","externalMutationCalls":0}
```

There is also no producer of the `INTERRUPTED` state. A persisted forward state is continued directly by
`remainingSequence`, so ordinary re-entry bypasses the advertised one-resume/two-hour transition.

Required action: make production oracles perform the live reads/mutations and create or load their own immutable
outputs at each transition. Reject future-complete caller bundles, re-read authority facts before every append,
persist explicit bounded interruption/resume, and make stale-lock recovery race-safe. Add fresh/upgrade full-path
and every-boundary fault tests that count external calls and prove no hand-written bundle can reach `DEPLOYED`.

### PRR-003 — pg_restore live checks still do not bind the socket to the isolated container (S1)

Location: `scripts/lp05/database/restore-evidence.ts:19-55`

`inspectLiveIsolatedTarget` selects a container and volume by Compose labels, but it then connects to the independently
declared `databaseHost/databasePort/databaseName` to read `pg_control_system()`. No Docker port/network identity binds
that socket to the selected container. `assertIsolatedTarget` parses only the isolated record and reads a few fields
from an unchecked caller `productionIdentity`.

Reviewer supplied an incomplete production object containing only a fake project and three inequality fields. The
mutation guard accepted it and printed `CALLER_PRODUCTION_IDENTITY_ACCEPTED`.

Required action: actively observe/parse the exact production identity and bind the mutation to the selected isolated
container—either by proving its exact port/network mapping or by running `psql`/`pg_restore` inside that container.
A mixed safe-container/unrelated-loopback-database input and any incomplete production identity must fail before
`age` or `pg_restore` starts.

### PRR-004 — Required CSP and safe redirect semantics are neither configured nor proved (S2)

Location: `scripts/lp05/smoke/external.ts:149-165`

Acceptance criterion 4 requires CSP and an HTTP redirect to the same HTTPS host. `deploy/Caddyfile` has no
`Content-Security-Policy`; `verifySecurityHeaders` does not require it; and the external engine accepts any
301/302/307/308 without inspecting `Location`. The committed passing adapter fixture contains neither CSP nor
`Location` and still emits all 22 PASS assertions.

Required action: add an application-compatible CSP to production and test Caddy, require it in local/external smoke,
and validate that the redirect destination is exactly the authorized HTTPS hostname/path with no userinfo or
downgrade. Add missing/wrong-host/downgrade redirect and missing/unsafe CSP negatives.

## Validation

- GitHub PR: OPEN, non-Draft, `CLEAN/MERGEABLE`, exact requested base/head.
- GitHub Actions run `30766943275`: `verify` job `91547250772` and `lp05-candidate` job `91547494503` both PASS on
  exact head `7e31f4829d3691bb1c20fa7417f68add0cfbf3eb`.
- `npm run test:deployment:unit`: 6 files, 41/41 tests PASS.
- `npm run typecheck`: PASS.
- `npm run deploy:lp05:validate`: `LP05_RELEASE_READINESS_PASS`.
- Full PR `git diff --check`: PASS.
- Reviewer hand-written complete-bundle controller counterexample: reproduced (blocking failure).
- Reviewer unchecked production-identity restore-guard counterexample: reproduced (blocking failure).
- Separate second pass over all new child-process, network, persistence, state, lock and restore call sites confirmed
  PRR-002/003 and exposed PRR-004. A fresh-context sub-reviewer was unavailable under the current no-delegation
  constraint.

The machine-readable result is `pr-review-7-7e31f4829d36.json` and validates against Engineering Review schema 1.1.
