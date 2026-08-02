# PR Review — LP-04 Cycle 2

- Repository: `zhanghao1903/idea-trace-validation`
- PR: [#6](https://github.com/zhanghao1903/idea-trace-validation/pull/6)
- Base: `codex/v0-1-project-plan` @ `818671c504c8b8b8cd41f8ebc096f341ece6b18f`
- Head: `codex/lp-04-ai-skill-demo` @ `4e05331cecf833858b2a11c22d9c59ceaaa34fb5`
- Previous reviewed head: `a1b02f6111777b104d794d7da0e11dd17a26a1c4`
- Mode: read-only re-review
- Decision: **REQUEST_CHANGES**
- Mergeable: **false**

## Outcome

Cycle 2 closes two of the three prior blockers. Exact child-resource readback now runs before `COMMITTED`, during terminal replay and in final verification. `IDEMPOTENCY_IN_PROGRESS` now receives bounded same-body/key retries and remains `OUTCOME_UNKNOWN` when exhausted. Both committed Codex and Claude records also pass the strengthened validator when Review supplies the exact ignored transcripts and live proof API.

Approval remains withheld for one retained blocker: the client verifier accepts a mixed request set when any one request ID is authoritative. A record containing one real ID and one invented ID returned `PASS`, so claimed client actions remain partly self-asserted.

## Prior finding transitions

| Finding | Previous | Current | Evidence |
| --- | --- | --- | --- |
| `PRR-001` | open | open | Both real proofs pass, but the mixed authoritative/invented request-ID counterexample also passes. |
| `PRR-002` | open | resolved | Exact report/progress mismatch tests, terminal zero-write replay and exact-head CI pass. |
| `PRR-003` | open | resolved | Retry-success and bounded-exhaustion tests preserve exact bytes/key and resumable state. |

## Blocking finding

### PRR-001 — Client proof still accepts uncorrelated claimed requests (`S1`)

Location: `scripts/lp04/verify-client-evidence.ts:359`

The Idea, project and final authority checks use existential matching: one matching `record.requestIds` value is sufficient. The remaining IDs are required only to occur as plain substrings in a structurally valid transcript. The negative unit test covers a single unrelated ID but not a mixed set.

Trigger: a proof uses one request ID copied from public synthetic history and adds invented request IDs to support recovery, report or objective claims.

Impact: the validator returns `PASS` while some claimed API actions have no independently checkable correlation, defeating AC-15's no-static-substitution gate.

Required change: require every successful recorded request ID to appear in the matching resource history. For rejected requests without audit events, parse and validate a client-specific transcript request/response event with the matching path, status and request ID. Add mixed-set, wrong-resource/path and unsupported-objective negative tests.

## Validation

| Check | Result |
| --- | --- |
| Exact-head GitHub `ci / verify` | PASS — run `30727622786`, job `91442133503` |
| `npm run build` | PASS |
| LP-04 runtime and Skill unit tests | PASS — 17/17 |
| Skill static validation | PASS |
| Codex committed proof + exact transcript + live proof API | PASS |
| Claude committed proof + exact transcript + live proof API | PASS |
| Mixed real/invented request-ID counterexample | FAIL — verifier returned `PASS` |
| Full PR and remediation `git diff --check` | PASS |

The PR was independently refreshed after it was marked Ready: GitHub reports `draft=false`, `mergeable=true`, exact base/head unchanged and the exact-head check green. Those gates do not override the remaining code finding.

## Re-review integrity

All 15 remediation files and the complete 53-file base-to-head PR were reconciled. The prior JSON result was verified at SHA-256 `a9d309b9d71c10aa19d22db0544204bfa93d8992f5fcab29cd060e4dfc2cc3d5` and is included on this review-record branch for a self-contained audit chain.

A fresh-context sub-agent pass was unavailable because the active developer policy prohibits delegation unless the user explicitly requests it. Review therefore performed a separate full/delta pass plus an executable adversarial reproduction and records this limitation explicitly.

## Non-blocking note

The PR body still names the Cycle 1 head and old test counts. Refreshing that narrative would reduce human-review confusion, but it is not a merge blocker.

The machine-readable result is [`pr-review-6-4e05331cecf8.json`](./pr-review-6-4e05331cecf8.json).
