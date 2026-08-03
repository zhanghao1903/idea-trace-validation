# LP-05 Verification Record

- Feature: `lp-05-deployment-release-8c3f1a6d5e20`
- Branch: `codex/lp-05-deployment-release`
- Runtime baseline: `46e021d261fd8a663c83430a551f5674365ccf14`
- Confirmed requirements: `d273a79212723513d8ac7150fb141949f6b19472`
- Approved plan: `9a1bcf42f428246ac7d11ab7f400adc133f10fc8`
- Approved composite digest:
  `230924753e3d466de75502efe353ed89274cf65605d76648b7f2cbac5a5f3370`
- Evidence scope: repository release-readiness only
- External deployment status: `NOT_RUN — awaiting separately authorized target`

## Delivered repository behavior

- Digest-pinned Node, PostgreSQL and Caddy images; multi-stage non-root/read-only application image with an exact
  source/release identity and repository-outside secret injection.
- Separate production and loopback test Compose topology. PostgreSQL and the application have no published host
  ports; only the HTTPS edge is externally reachable.
- Closed deployment proposal, authorization envelope, attempt transition, candidate, backup, restore, smoke and
  final-evidence records with canonical SHA-256 identities and fail-closed parsers.
- Streaming encrypted backup, seven-copy retention, isolated restore checks, production-before/after identity,
  credential rotation, rollback and bounded operational diagnostics.
- Versioned runbook for toolchain/DNS/secret preflight, first install, upgrade, migration, health, backup, restore,
  rotation, rollback and evidence verification.
- Code Review Cycle 1 remediation makes external smoke an active observer, makes every deployment state consume a
  closed authority-bound projection under a single-target lock with persisted rollback, and binds `pg_restore` to
  the exact re-inspected isolated DB destination before either subprocess starts.
- Code Review Cycle 2 remediation removes future evidence from the production controller request, makes every phase
  an active host operation with a controller-owned reconciled output, adds race-safe stale-lock recovery plus the
  explicit bounded interruption transition, binds restore mutation to the exact inspected Compose DB container and
  a complete actively revalidated production identity, and requires exact same-host HTTPS redirect and CSP
  semantics.

## Objective repository results

| Scope | Result |
| --- | --- |
| `npm run format:check` | PASS |
| `npm run lint` | PASS |
| `npm run skill:check` | PASS |
| `npm run typecheck` and `npm run typecheck:lp05` | PASS; application workspaces and deploy/runtime scripts are both checked |
| `npm run build` and frozen OpenAPI/report-type checks | PASS; Web bundle 97.35 KiB gzip |
| repository unit/contract/integration/Web component tests | PASS; 107 + 23 + 31 + 8 tests |
| LP-01–LP-04 acceptance tests | PASS; 13 tests on the isolated PostgreSQL database |
| `npm run test:deployment:unit` | PASS; 6 files, 52 tests after Cycle 2 active-operation, resume, restore-target and HTTP-boundary regressions |
| `npm run deploy:lp05:validate` | PASS; `LP05_RELEASE_READINESS_PASS` |
| digest-pinned Caddy validation | PASS; production and local-test files are valid with explicit redirects and exact CSP |
| Playwright LP-03/LP-04 stories | PASS; 7 + 1 scenarios |
| `npm run verify` | PASS; complete ordered gate |
| immutable `linux/amd64` candidate | PASS; ignored manifest binds the exact source commit/tree |
| candidate archive/provenance verification | PASS; `LP05_CANDIDATE_PASS` |
| loopback production topology | PASS; `LP05_LOCAL_ACCEPTANCE_PASS` |

The candidate build itself reran the complete repository gate from a clean tree before creating the OCI archive.
The loopback test loaded that archive, started digest-pinned PostgreSQL and Caddy, ran all three migrations, proved
the app is non-root/read-only, proved app/PostgreSQL ports are not published, and verified the exact HTTP-to-HTTPS
redirect plus readiness/OpenAPI through local TLS with the required CSP/security headers. It then removed only its
unique temporary project resources. GitHub CI independently rebuilds and repeats the same process from the exact PR
head and checks a clean tree afterward.

## External boundary and blockers

The following are intentionally **not run** and are not claimed as PASS:

| External proof | Status | Required unblocker |
| --- | --- | --- |
| Empty authorized Linux server preflight | NOT RUN | server identity/access and toolchain installation sources |
| DNS, trusted HTTPS and public security/request-boundary smoke | NOT RUN | authorized domain/DNS and exact public IP set |
| Production secret installation and rotation | NOT RUN | repository-outside secret delivery and rotation authorization |
| Production pre-migration and post-deploy encrypted backups | NOT RUN | authorized backup root/recipient and target database |
| Production backup to isolated restore and synthetic read equality | NOT RUN | exact post-deploy backup and restore authorization |
| Public LP-04 synthetic journey and post-restore re-smoke | NOT RUN | public synthetic-data permission and deployment authorization |

Requirements confirmation, plan/code approval, merge and repository verification do not authorize any item in this
table. A future authorization must bind the exact candidate manifest digest, target/server, domain/public IPs,
deploy/backup/secret roots, operation set, exclusions and expiry. Until the external chain passes, LP-05 may be
`Ready for Acceptance` as repository delivery but cannot be `Accepted`, and REQ-026/AC-019 remain unproven.

## Security notes

- No production token, cookie, database URL/password, TLS private key, age identity or private request body is in
  this record or the tracked deployment examples.
- `.lp05-release/` and local IDE state are ignored. Candidate archives, runtime secrets, raw logs, external
  authorization records and encrypted backups stay outside Git.
- `LOCAL` or `TEST_FIXTURE` observations can test orchestration and negative cases but cannot populate an external
  attempt state or authorize final deployment evidence.
