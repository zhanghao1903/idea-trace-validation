# PR Review — idea-trace-validation #1 — Cycle 11

## Review Metadata

- Repository: `zhanghao1903/idea-trace-validation`
- PR: <https://github.com/zhanghao1903/idea-trace-validation/pull/1>
- Base: `codex/v0-1-project-plan@9259d884459dd36bde6c089c3a15b368c985b617`
- Reviewed head: `codex/v0-1-project-management@59cb2947802402a30bd307b2d51b31fb8335eb90`
- Review kind: re-review, read-only
- Superseded report: cycle 10 at `2c2d0772af15ba9a2a37b2111d34c9c48cb66823`

## Decision

**REQUEST_CHANGES**

The exact snapshot is not mergeable under the review contract. Four blocking
findings remain: `PRR-003`, `PRR-004`, `PRR-008`, and `PRR-009`.

## Executive Summary

Cycle eleven reproduces the claimed deterministic 13/13 positive evidence and
all 182 stock harness outcomes. Literal-tilde `CODEX_HOME` handling is fixed,
and all previously resolved pagination, lifecycle, mutation and reopened-Draft
regressions remain closed.

Approval renewal is withheld because ordinary commented source syntax still
bypasses secret scanning, validator discovery is replaceable and
provenance-free, the checker rejects every future implementation file, and the
Current portfolio contradicts the linked plan metadata.

## Scope and Change Map

The remediation range
`d1516fe2c4efcab955136fbfecae6e89d7969ed5..59cb2947802402a30bd307b2d51b31fb8335eb90`
contains one commit and three files:

- `CHANGELOG.md`;
- `docs/feature/v0-1-project-management/implementation-plan.md`;
- `docs/project-management.md`.

It adds 31 lines and removes 12. The complete 14-file base-to-head diff was
also reconciled, and `git diff --check` passes.

Finding transitions:

- `PRR-003`: open → open;
- `PRR-004`: open → open;
- `PRR-007`: open → resolved;
- `PRR-006`, `PRR-005`, `PRR-002`, `PRR-001`: remain resolved;
- `PRR-008`, `PRR-009`: new forward-risk findings.

## Findings

### PRR-003 — S1 blocking — Commented flow keys bypass scanning

A valid source comment between `apiKeys` and `:` becomes part of the parsed key.
Normalization no longer ends in a sensitive suffix, and the scalar matcher
also misses it. The exact fixture exits zero with `SECRETS PASS`; redacted
result SHA-256:
`52ce784071c4e1cc6aef2e7766112094d337f27cd640184fafb5b0f2c609e290`.

Required change: preserve sensitive-key identity across comments/trivia or fail
closed, and add the exact redacted regression.

### PRR-004 — S1 blocking — Canonical validator is replaceable

Production discovery searches account, `HOME`, and `CODEX_HOME` plugin caches,
then picks the lexically last full path. Validator version/digest is not bound
into authority. A `CODEX_HOME` candidate makes an empty-plan state rejected by
the installed workflowctl receive 13/13 PASS; result SHA-256:
`987890c9306a1f6f65a9d6146ae7de0af94a7b99e1898e19323906f9628df76a`.

Required change: resolve one trusted active validator, reject ambiguity, and
bind path-independent validator version plus digest into authority evidence.

### PRR-008 — S1 blocking — Future implementation files are rejected

`FILES` compares every tracked path with the current fixed documentation list.
The lifecycle harness removes its temporary implementation files before the
advertised implementation head. Retaining one ordinary source file makes only
`FILES` fail; result SHA-256:
`bbf1ce9fc4d886cf356f20af1598868d12bc4b9a904fdd7ebfcdcacf5be49504`.

Required change: enforce the managed plan set without freezing the entire
repository file set, and add a non-Draft positive retaining normal source and
test files.

### PRR-009 — S2 blocking — Portfolio authority metadata contradicts sources

The Current portfolio labels links `ApprovedDesign` and
`ApprovedImplementationPlan`. The linked design still says Proposed F2,
`PLAN_CHANGES_REQUESTED`, cycle-three FAIL; the implementation plan says F3,
`PLAN_CHANGES_REQUESTED`, and the same FAIL.

Required change: synchronize all three sources with the exact cycle-four PASS
authority, or remove the unsupported approval claim, and validate parity.

## Required Actions

- Resolve `PRR-003` with syntax-aware, value-redacted secret classification.
- Resolve `PRR-004` with trusted, deterministic validator provenance.
- Resolve `PRR-008` with implementation-compatible file-set validation.
- Resolve `PRR-009` with exact cross-document lifecycle authority parity.
- Preserve all resolved regressions, especially `PRR-007` root equivalence.

## Risk Assessment

- Security: High — source syntax still hides a credential.
- Data integrity: High — validator identity and public authority disagree.
- Compatibility: High — future implementation heads cannot pass.
- Reliability: Medium — root expansion is fixed, but validator selection is not.
- Deployment/rollback: Low — no deployment occurred; Git history is recoverable.

## Validation Evidence

- Cycle-ten JSON digest: PASS,
  `df36e03fa51dd38ee0140f01883268ab4f8f6d31cc61eff717c680854b149da6`.
- Complete base-to-head `git diff --check`: PASS.
- Positive checker: PASS twice, byte-identical SHA-256
  `730b761366908bc057877f08c8a4c43b748b8778acddae4604f605ee3f797a6d`.
- Harness: PASS — 136 expected failures, 28 expected passes, six expected
  errors, twelve mutants; SHA-256
  `d711f6d4d6a7b8096bc8c0dc523962f6e24e2ae3f665050ffda8f1ff0c8b5157`.
- Primary forward-risk review: FAIL; SHA-256
  `80bd5e3444e9fb2c595f149026452a3d030040436a71510923754a3ae3f10e90`.
- Independent audit: FAIL; SHA-256
  `9e74f0b593c8b294433d036aacc9efae503f4cb9057223dc6ff250eb18db3fb5`.
- GitHub checks: UNKNOWN; zero commit statuses were reported.

## Coverage and Limitations

The checker, harness and raw outputs are external task artifacts and are not
tracked in the PR. The exact PR head is all-Draft, so non-Draft authority was
exercised with disposable fixtures. Runtime, browser, deployment, DNS, HTTPS,
backup and restore checks belong to later IP lifecycles and were not run.

## Open Questions and Assumptions

No decision-blocking open question remains. The VerificationEnvelope was
verified as Main's intended exact-head evidence. The assumption that all 182
stock outcomes establish the complete contract was falsified by primary and
independent review.

## Non-blocking Recommendations

None. All requested changes above are merge-blocking.

## Machine-readable Summary

The canonical result is
`pr-review-idea-trace-validation-1-59cb29478024-cycle-11.json`.
