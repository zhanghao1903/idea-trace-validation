# PR Review — idea-trace-validation #1 — Cycle 7

- Repository: `zhanghao1903/idea-trace-validation`
- PR: <https://github.com/zhanghao1903/idea-trace-validation/pull/1>
- Base: `codex/v0-1-project-plan@9259d884459dd36bde6c089c3a15b368c985b617`
- Reviewed head: `codex/v0-1-project-management@f6058de85c497ed91bdf2c80afe677c32f4d27ee`
- Review mode: read-only
- Decision: **REQUEST_CHANGES**

## Summary

Cycle seven validates the two-commit, three-file remediation and reproduces its
deterministic positive evidence and complete 110-outcome harness. The four
concrete cycle-six attacks are now rejected.

Approval renewal is still withheld. Primary and independent fresh-context
validation found three blocking contract gaps:

1. the checker still accepts caller-forged test authority and structured
   credential assignments;
2. eight of the sixteen documented lifecycle transitions cannot validate;
3. GitHub authority collections are truncated to their first 100 items.

## Delta review

The exact remediation range is
`53336853a7555e11ab3ac07ff6556091420772bb..f6058de85c497ed91bdf2c80afe677c32f4d27ee`.
It contains:

- `253344eb06dfb3e26f703dea3f0c9ae46a19a1c8` —
  require external lifecycle authority;
- `f6058de85c497ed91bdf2c80afe677c32f4d27ee` —
  bind the implementation range to the live PR.

The 59 insertions and 15 deletions affect only:

- `CHANGELOG.md`;
- `docs/feature/v0-1-project-management/implementation-plan.md`;
- `docs/project-management.md`.

All delta files and the complete 14-file base-to-head diff were reconciled.
`git diff --check` passes with no unclassified changes.

## Finding revalidation

### PRR-003 — Open

The four exact cycle-six fixtures now fail: the shorter CommonMark fence, AWS
access-key ID, self-asserted Accepted authority and non-schema MERGED decision
are closed. The same security/testing fingerprint remains open because new
committed reproductions still receive 13/13 PASS.

### PRR-002 — Resolved

The refreshed harness retains every cycle-two regression.

### PRR-001 — Resolved

The refreshed harness retains every original governance and error-output
regression.

## Blocking findings

### PRR-003 (S1) — Checker still permits forged authority and structured credential values

The tracked input contract permits `--lifecycle-state` only for an isolated
temporary test repository with external, non-link state/config files. The
checker proves only that the checkout is under `os.tmpdir()`. A
production-shaped clone with the real GitHub origin and CI environment
therefore accepts fully fabricated lifecycle state. It also calls `realpath`
before `lstat`, so a symlinked override is accepted as a regular file.

The credential scanner separately exempts every sensitive assignment whose
value starts with `[` or `{`. Committed `api_key: ["…"]` and
`token: {value: "…"}` fixtures both returned exit 0 and 13/13 PASS.

Impact: authorization-grade evidence can be forged and structured production
credentials can be committed while the advertised gate remains green.

Required remediation:

- remove the override from the production entry point or gate it behind an
  unforgeable test-only capability/build boundary;
- inspect the supplied path with `lstat` before normalization and bind an
  explicit fixture identity;
- recursively scan array/object values assigned to sensitive terminal keys,
  with redacted diagnostics;
- add all direct, symlink and structured-value reproductions to the harness.

Evidence:

- primary forward-risk summary SHA-256
  `9a0dce60cf2f54a0704a071d544f79376870404d997b863669c5c2245286e908`;
- structured-secret summary SHA-256
  `1c038f93d13ff2fa81ebc81737e29c18e18d55cf8e3323efac06cebf3df13cea`;
- independent audit SHA-256
  `af509c3ae22ccccf35187a685fcb9bfd8983e4aa0f6f05046bd8bf87fe04d49b`.

### PRR-004 (S1) — Half of the documented lifecycle transitions cannot validate

The approved design defines seven statuses and sixteen guarded transitions.
The checker omits `Deferred` from its durable-stage mapping and omits these
eight public edges:

- `Draft → Deferred`;
- `Ready → Deferred`;
- `In Progress → Deferred`;
- `Blocked → Deferred`;
- `In Review → Deferred`;
- `Deferred → Draft`;
- `Deferred → Ready`;
- `Accepted → Draft`.

A valid-looking `Ready → Deferred` projection fails with “authority bundle
transition is invalid or not role-bound” and “plan status does not match the
current durable lifecycle feature stage.” `Draft → Deferred` is additionally
forced through Ready-style RequirementsHandoff and PASS-plan prerequisites.

Impact: defer, recovery and reopen behavior described by the public contract
cannot be represented.

Required remediation:

- implement durable authority for `Deferred` and all sixteen edges;
- keep the contract and checker mappings in one exhaustive source;
- add positive end-to-end fixtures for every status and edge, plus negative
  wrong-role, wrong-edge, stale-projection and missing-recovery fixtures.

### PRR-005 (S2) — GitHub authority resolution truncates collections at 100 items

The checker requests PR files, check runs and reviews with `per_page=100`, but
does not fetch later pages. It then compares GitHub counts with the first page
or searches only that page for required checks and the AcceptanceOwner review.

Impact: valid `In Review` or `Accepted` projections fail when a PR, check suite
or review history exceeds 100 items.

Required remediation:

- paginate all GitHub authority collections to completion;
- reject inconsistent counts and include the complete canonical observation in
  `authoritySnapshotDigest`;
- add 100/101 boundary fixtures with required evidence located on page two.

## Validation

- Previous cycle-six JSON digest: PASS,
  `5c57d1a64b1e21dddddbcdc2d2cfe5502b97e901a2f5015296338b9b65a269a6`.
- Complete base-to-head `git diff --check`: PASS.
- Exact-head positive checker: PASS twice, byte-identical SHA-256
  `805df646ecf7ef067f3d14d82e09fa2e625727f5903f8311d461c277d7655419`.
- Refreshed harness: PASS — 89 expected failures, three expected passes, six
  expected errors and twelve mutant kills; SHA-256
  `c8373521035da27bf8831fba4cd11d74f2cd8fcfdac998056d6a8e31243209f8`.
- Cycle-six attack replay: PASS; all four invalid fixtures fail; SHA-256
  `6df6a3ed6b9b8508bb91c0eb9d75edaf07b52ecda3eb1bd6eb1c7adc95d6b93b`.
- Cycle-seven primary forward-risk pass: FAIL.
- Structured-secret reproduction: FAIL.
- Independent fresh-context audit: FAIL.
- GitHub status checks: UNKNOWN; the live PR returned an empty rollup.

The PR was open, non-draft and mergeable at the exact routed base/head when
observed. No rulesets or branch protection were reported. Merge was not
requested and no GitHub review was published.

## Decision

**REQUEST_CHANGES**

Open blocking findings: `PRR-003`, `PRR-004`, `PRR-005`.

The canonical machine-readable record is
`pr-review-idea-trace-validation-1-f6058de85c49-cycle-7.json`.
