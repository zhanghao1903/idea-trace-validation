# PR #6 Code Review — Cycle 3

- Repository: `zhanghao1903/idea-trace-validation`
- Base: `818671c504c8b8b8cd41f8ebc096f341ece6b18f`
- Head: `dc562757d98ab74adc54833c46286112c58d34de`
- Decision: **REQUEST_CHANGES**
- Merge: **not requested** (review-only)
- Exact-head CI: **PASS**

## Outcome

Cycle 3 closes the mixed-authoritative/invented-ID bypass and correctly binds rejected Claude requests to an exact parsed request/response. Both committed Codex and Claude proof records also pass independent replay against their exact ignored transcripts and the live proof API.

Approval remains withheld for one blocking finding: **PRR-001**. A COMMITTED claim is still accepted when its request ID appears anywhere in the selected Idea/project audit history. Its method, exact path and status are not compared with the actual event or a parsed transcript operation, and objective results remain labels.

## Blocking finding

### PRR-001 — Committed client claims still accept the wrong operation and status (S1)

At `scripts/lp04/verify-client-evidence.ts:566-571`, the COMMITTED branch checks only whether the request ID belongs to the aggregate selected from the path. It does not use `method`, exact `path`, or `status` to establish which operation happened.

The exact-head counterexample used a real `IDEA_CREATED` request ID but claimed:

- `POST /api/v1/ideas/{sameIdeaId}/promotions`
- status `299`
- outcome `COMMITTED`

The verifier returned `accepted=true`. The positive records still pass, so the remaining issue is the proof discriminator, not evidence availability.

Required remediation: bind every COMMITTED claim's method, exact path and status to parsed client request/response evidence or an explicit authoritative event-to-operation mapping; derive objective results from those matched facts; add same-resource wrong-endpoint, wrong-status and unsupported-objective negative tests.

## Revalidation

- PRR-001: **open → open** (same fingerprint; scope narrowed)
- PRR-002: **resolved → resolved**
- PRR-003: **resolved → resolved**

## Validation

- Locked dependency install: PASS
- Production build: PASS
- Targeted LP-04 unit tests: PASS (18 tests)
- Skill contract check: PASS
- Real Codex client proof replay: PASS
- Real Claude client proof replay: PASS
- Full and delta whitespace checks: PASS
- Exact-head GitHub `ci / verify`: PASS
- Same-resource wrong-operation/status negative: FAIL as a review gate because the verifier accepted it

No merge was attempted.

