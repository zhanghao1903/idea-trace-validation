# LP-04 Verification Record

- Feature: `lp-04-ai-skill-demo-5f8c2a9d7e41`
- Branch: `codex/lp-04-ai-skill-demo`
- Runtime baseline: `818671c504c8b8b8cd41f8ebc096f341ece6b18f`
- Confirmed requirements: `40e0edb4da153fbe9bc0c90edb0a39d9b085a520`
- Approved plan: `e9c56653901583f2824f8662b1a87dc2c1a69c5c`
- Approved composite digest:
  `24d41fd9b5a5f10e07daa9c2a941f0fe411833663ba9ccb7d1ecc3035cb76f6b`
- Exact Skill commit: `55fefc83f02ada8a0310bacc7402faf72642d726`
- Evidence status: Cycle 3 retained finding remediated; ready for exact-head Cycle 4 Engineering
  Review on 2026-08-02 (Asia/Shanghai)

## Exact-head and status boundary

This record distinguishes implemented automation from external-client acceptance. Cycle 3 confirmed
that mixed real/invented IDs fail closed, but retained PRR-001 because one real same-resource request
could still be relabeled as another operation/status. Every committed claim now matches an explicit
authoritative audit-event to method/exact-path/status mapping; Claude committed and rejected claims
also match exact transcript request/response facts. Objective PASS values are independently derived
from those facts, recovery evidence and public resource/collection reads. Both real client records
pass this verifier. A new immutable `CodeReviewRequest` and PR checks must bind the remediation
commands to the exact PR head. `Ready for Acceptance` is not formal acceptance, merge approval or
publication authority.

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
- Shared exact public-resource verifier for every committed Idea, project, progress update,
  attention item, Evidence item, conclusion, transition, confirmation and report. Terminal replay
  performs those reads again and sends zero writes.
- Bounded `IDEMPOTENCY_IN_PROGRESS` recovery reuses the frozen bytes and key for at most three
  attempts; exhausted entries remain `OUTCOME_UNKNOWN` and resumable instead of becoming rejected.
- Closed client request claims: mixed real/invented IDs, wrong resource paths, mismatched rejected
  statuses/IDs, same-resource wrong endpoints/statuses and unsupported or unproved objectives fail
  closed. Successful report identity remains bound by the transcript report ID and exact public
  current-report read because LP-03 does not expose report-aggregate audit IDs through project
  history.
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
| `npm run test:unit` | PASS; 55/55 |
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

These results were captured on the implementation worktree and will be rerun without file changes on
the exact final PR head. The PR check and immutable review request will bind that final head.

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

| Client | Current result | Immutable evidence |
| --- | --- | --- |
| Codex | PASS | [`codex-client-proof.json`](./evidence/codex-client-proof.json): actual `codex-cli 0.146.0-alpha.9.2` run, exact Skill tree, unknown-result replay, request/resource IDs, ignored transcript digest and live public re-read |
| Claude | PASS | [`claude-client-proof.json`](./evidence/claude-client-proof.json): actual Claude Desktop/Claude Code local session, ready-Idea promotion, one execution fact, invalid/corrected report flow, both role views and stop before human confirmation |

The verifier reads the operator-supplied raw transcript, checks its exact digest, requires the run,
claimed POST requests and resource identifiers to occur in that transcript, and verifies the exact
Skill tree. Every `COMMITTED` request claim must match its public audit event's fixed method, exact
path and status; Claude claims additionally pair the client tool request and response. Every
`REJECTED` claim must pair a client-specific tool request with its exact response. Objective results
are derived from these facts and exact synthetic Idea, project, report, progress and experience
reads; same-resource relabeling, arbitrary PASS labels or unrelated live resources fail.
Main additionally re-read every referenced resource through the loopback public API. The Claude
projection contains exactly one AI/EXECUTOR progress update, exactly one accepted report revision
and zero human confirmations. Its invalid report did not create a submission-key or revision row.
Both raw transcripts and the authorized minimal Claude workspace passed exact-token, live bearer,
AWS key and private-key scans; neither transcript is committed.

The client-proof database is isolated from the acceptance-test database so the full suite cannot
erase its evidence. Independent re-verification uses the committed evidence record plus the ignored
local transcript explicitly:

```bash
npm run demo:lp04:verify-client -- \
  --base-url http://127.0.0.1:<proof-port> \
  --file docs/feature/lp-04-ai-skill-demo/evidence/<client>-client-proof.json \
  --transcript <ignored-raw-client-transcript.jsonl>
```

## Delivery disposition

LP-03 is durably accepted without publication at merge
`818671c504c8b8b8cd41f8ebc096f341ece6b18f`, acceptance
`7f8aeac9327278dc08bd84d2f229ebc9f6b166a109e4a7c83a0001a49bf7ce8`, closure
`25fd479b6c7663d41920bc50935c5bd1fd5efb7f2d4a3e14252015a889e360f8`, with release targets `[]`.

LP-04 is `Ready for Acceptance`. Its acceptance record is still `None`; no merge, tag, GitHub Release,
package, deployment or other publication has been performed. Cycles 1 through 3 were not approved.
Engineering Review must approve the exact Cycle 4 remediation head before any separately authorized
merge and later acceptance-only/no-publish closure.
