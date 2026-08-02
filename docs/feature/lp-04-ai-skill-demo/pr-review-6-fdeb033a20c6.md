# PR #6 Code Review — Cycle 4

## Review Metadata

- Repository: `zhanghao1903/idea-trace-validation`
- PR: [#6](https://github.com/zhanghao1903/idea-trace-validation/pull/6)
- Title: LP-04: AI Skill and repeatable demo
- Author: `zhanghao1903`
- Base: `codex/v0-1-project-plan` @ `818671c504c8b8b8cd41f8ebc096f341ece6b18f`
- Head: `codex/lp-04-ai-skill-demo` @ `fdeb033a20c6efcbe0ff65202a20258032b862e1`
- Reviewed at: `2026-08-02T03:53:43Z`
- Reviewer: Codex Engineering Lifecycle Review
- Mode: `RE_REVIEW`, read-only
- Supersedes: Cycle 3 report `pr-review-6-dc562757d98a.md`

## Decision

**REQUEST_CHANGES** — not mergeable under the workflow gate.

Blocking findings: 1 (`PRR-001`). Exact-head `ci / verify` and both real client proof replays pass. Review did not request or execute a merge.

## Executive Summary

Cycle 4 correctly binds authoritative audit events to fixed method/path/status semantics, requires exact transcript correlation for Claude committed/rejected requests, and derives objective checks from transcript/live facts. It closes the previous same-resource claim relabeling example.

PRR-001 remains open in a narrower Codex-only form. The Codex replay facts can come from any POST pair and are not correlated with the accepted request claim. A deterministic counterexample replayed only a Project transition while authority/record claimed Idea creation; the verifier still returned PASS.

## Scope and Change Map

The complete `dc562757d98ab74adc54833c46286112c58d34de..fdeb033a20c6efcbe0ff65202a20258032b862e1` delta contains one commit and 9 reviewed files, with no excluded or unclassified changes. The complete base-to-head PR diff was reconciled against the earlier three review cycles.

| Area | Change | Risk | Result |
| --- | --- | --- | --- |
| Authoritative operation mapping | Fixed event-to-method/path/status tuples | Low | PASS |
| Claude transcript correlation | Exact committed/rejected request/response matching | Medium | PASS |
| Codex replay/objective correlation | Parse replay path/body/key facts and derive objectives | High | FAIL — facts are not joined to the claim |
| Evidence/docs/status | Refresh Claude transcript digest and Cycle 4 narrative | Medium | Closure wording remains premature |

Finding transitions:

- PRR-001: open → open (same fingerprint; narrowed to Codex cross-correlation)
- PRR-002: resolved → resolved
- PRR-003: resolved → resolved

The fresh-context independent pass requested by the review skill was unavailable because active developer policy prohibits delegation without explicit user authorization. Review instead completed a separate second pass over the full verifier/delta and ran an independent executable counterexample.

## Findings

### PRR-001 — [S1][Blocking][Testing] Codex replay evidence is not bound to the accepted request claim

- **Location:** `scripts/lp04/verify-client-evidence.ts:975-1014` @ `fdeb033a20c6efcbe0ff65202a20258032b862e1`
- **Confidence:** High
- **Observation:** All COMMITTED claims are checked against authority, but transcript-claim matching is conditional on `client === "CLAUDE"`. CODEX replay objectives are granted from any timeout/success curl pair without comparing its path or response request ID to the accepted claim.
- **Trigger:** Use a real authoritative Idea-create request/resource and include its IDs in the transcript, while the transcript's only replayed POST targets another non-human operation such as a Project transition.
- **Impact:** Live authority and an unrelated Codex replay can be assembled into a PASS compatibility record even though Codex did not execute the claimed request, violating AC-15 and the approved no-static-substitution gate.
- **Evidence:** The exact-head counterexample replayed only `POST /api/v1/projects/{otherProject}/transitions`, while the accepted record/authority claimed `POST /api/v1/ideas` status 201. `verifyClientEvidence` returned `accepted=true`.
- **Required change:** Bind a parsed Codex POST/response fact and the body/key replay tuple to the same authoritative request claim, including method, exact path, terminal status and request ID.
- **Verification:** Preserve both real client PASS results and existing negatives; add a cross-operation negative where transcript and authority are each individually valid but describe different requests.

## Required Actions

- PRR-001: correlate the Codex transcript operation/replay tuple with the same accepted authoritative claim and add the discriminating cross-operation test.
- PRR-002 and PRR-003 remain completed.

## Risk Assessment

- Data integrity / acceptance evidence: High until PRR-001 is resolved.
- Reliability/concurrency: Low; child readback and retry recovery remain covered.
- Security/privacy: Low; raw transcripts stayed ignored and passed sanitization.
- Deployment/rollback: Low; LP-04 remains additive and has no production migration.

## Validation Evidence

- Default Node 26 locked install: expected FAIL at the repository engine gate.
- Bundled Node 24.14.0 / npm 11.12.1 locked install with engine-strict disabled: PASS (364 packages; runtime mismatch recorded).
- Production build: PASS; Web JavaScript gzip 97.35 KiB.
- Targeted LP-04 unit/Skill tests: PASS (2 files, 18 tests).
- Skill contract check: PASS.
- Real Codex proof + exact ignored transcript + live loopback authority: PASS.
- Real Claude proof + exact ignored transcript + live loopback authority: PASS.
- Full and delta `git diff --check`: PASS.
- Exact-head GitHub `ci / verify`: PASS.
- Codex cross-operation negative: review gate FAIL because the verifier accepted it.

## Coverage and Limitations

All 9 Cycle 4 files and the complete effective PR diff were classified. Reviewer-local npm is 11.12.1 rather than the declared 11.16.0; exact configured-runtime evidence comes from GitHub CI. Production deployment, load and real-user study were outside scope. The proof API was used read-only.

## Open Questions and Assumptions

No open question changes the decision. GitHub base/head/draft/mergeability, exact-head CI, transcript digests and live proof availability were independently verified.

## Non-blocking Recommendations

None.

## Machine-readable Summary

See `docs/feature/lp-04-ai-skill-demo/pr-review-6-fdeb033a20c6.json`.
