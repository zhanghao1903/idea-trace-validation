# LP-04 Verification Record

- Feature: `lp-04-ai-skill-demo-5f8c2a9d7e41`
- Branch: `codex/lp-04-ai-skill-demo`
- Runtime baseline: `818671c504c8b8b8cd41f8ebc096f341ece6b18f`
- Confirmed requirements: `40e0edb4da153fbe9bc0c90edb0a39d9b085a520`
- Approved plan: `e9c56653901583f2824f8662b1a87dc2c1a69c5c`
- Approved composite digest:
  `24d41fd9b5a5f10e07daa9c2a941f0fe411833663ba9ccb7d1ecc3035cb76f6b`
- Exact Skill commit: `55fefc83f02ada8a0310bacc7402faf72642d726`
- Evidence status: in progress on 2026-08-01 (Asia/Shanghai)

## Exact-head and status boundary

This record distinguishes implemented automation from external-client acceptance. The immutable
`CodeReviewRequest` and PR checks will bind final commands to the exact PR head. Until both actual
Codex and Claude records pass, LP-04 is not `Ready for Acceptance`; this file is not formal
acceptance, merge approval or publication authority.

## Delivered behavior

- Repository-versioned, client-neutral `idea-validation-workflow` Skill with bounded API, report,
  recovery, credential and human-handoff references.
- Narrow static checker for required files, frontmatter, canonical links, existing route/error names,
  unsafe loading guidance and obvious committed secrets. It is not an authorization or lifecycle
  simulator.
- Deterministic synthetic manifest, canonical request identity, durable request journal, fail-closed
  run record, loopback/environment guards and real HTTP scenario runner.
- Cross-process crash/restart proof for post-upstream unknown results, same-process dropped-response
  regression, PREPARED recovery, exact body/key replay and public uniqueness reconciliation.
- Separate human facilitator that requires exact manifest binding and explicit synthetic-demo opt-in,
  without writing or printing human-control material.
- Real-data Chromium story over the production Web build and actual API/database, plus isolation from
  the existing LP-03 mocked browser suite.

## Objective automation results

| Scope | Result |
| --- | --- |
| `npm run format:check` | PASS |
| `npm run lint` | PASS |
| `npm run skill:check` and Skill Creator `quick_validate.py` | PASS |
| `npm run report-types:check` | PASS |
| `npm run typecheck` | PASS, including Playwright sources |
| `npm run build` | PASS; production Web JavaScript 97.35 KiB gzip |
| `npm run openapi:check` | PASS; LP-01/LP-02 immutable digests and LP-03 current artifact |
| `npm run test:unit` | PASS; 50/50 |
| `npm run test:contract` | PASS; 23/23, including current management projection |
| `npm run test:integration` | PASS; 31/31 |
| `npm run test:acceptance:lp01` | PASS; 2/2 on the isolated database |
| `npm run test:acceptance:lp02` | PASS; 2/2 on the isolated database |
| `npm run test:acceptance:lp03` | PASS; 6/6 on the isolated database |
| `npm run test:acceptance:lp04` | PASS; 3/3 real HTTP acceptance cases |
| `npm run test:web:component` | PASS; 8/8 |
| `npm run test:browser` | PASS; existing LP-03 suite 7/7 after test isolation |
| `npm run test:browser:lp04` | PASS; 1/1 real-data proposer/executor story |
| `npm run verify` | PASS; ordered gate now includes Skill and LP-04 browser verification |
| `git diff --check` | PASS |

These results were captured on the documentation worktree before the documentation commit. They will
be rerun on the exact final PR head after both mandatory client records are available; they do not
override the failed client gate below.

## Recovery and security evidence

- The fault proxy drops the downstream response only after observing the upstream response. A fresh
  process then reuses journaled canonical bytes and key, receives an idempotent replay and proves one
  Idea/audit/idempotency record through public and database oracles.
- PREPARED-before-send, DISPATCHED-before-fetch ordering survives process termination. Corrupt,
  stale, terminal-drift and wrong Skill/manifest bindings stop before sending.
- Run records and committed projections reject bearer/cookie/password/token assignments, credential
  URLs, database URLs, AWS access keys, exact in-memory secrets and oversized evidence.
- The browser story generates tokens in memory, disables trace/screenshot/video, exposes no decision
  controls and proves the same project/report IDs in proposer and executor views.
- `.lp04-demo/` is ignored. No request body, secret, raw transcript, journal or Playwright artifact is
  staged by the implementation commits.

## Actual client gate

| Client | Current result | Required evidence |
| --- | --- | --- |
| Codex | NOT PASSED | Actual client run, exact Skill commit/version, unknown-result replay, request/resource IDs, ignored raw transcript digest and live re-read |
| Claude | NOT PASSED; no executable or authenticated session is currently available | Actual client run for ready-Idea promotion, execution fact, report submit/correction and stop before human boundary |

An attempted nested Codex CLI run under `workspace-write` could not access the loopback API. No
business write or PASS record was produced. Running that subprocess with an unrestricted sandbox
requires explicit user authorization; direct scripted HTTP or static output is not accepted as a
substitute. Claude is likewise not represented by a fabricated record.

## Delivery disposition

LP-03 is durably accepted without publication at merge
`818671c504c8b8b8cd41f8ebc096f341ece6b18f`, acceptance
`7f8aeac9327278dc08bd84d2f229ebc9f6b166a109e4a7c83a0001a49bf7ce8`, closure
`25fd479b6c7663d41920bc50935c5bd1fd5efb7f2d4a3e14252015a889e360f8`, with release targets `[]`.

LP-04 remains `In Progress`. Its acceptance record is `None`; no PR is ready for Engineering Review
until both mandatory client proofs and the exact-head full verification matrix pass.
