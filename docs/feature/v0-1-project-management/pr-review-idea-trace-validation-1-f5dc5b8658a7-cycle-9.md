# PR Review — idea-trace-validation #1 — Cycle 9

- Repository: `zhanghao1903/idea-trace-validation`
- PR: <https://github.com/zhanghao1903/idea-trace-validation/pull/1>
- Base: `codex/v0-1-project-plan@9259d884459dd36bde6c089c3a15b368c985b617`
- Reviewed head: `codex/v0-1-project-management@f5dc5b8658a76f0d30bab20e1eb6be20bb320c44`
- Review mode: read-only
- Decision: **REQUEST_CHANGES**

## Summary

Cycle nine validates the one-commit, three-file remediation and independently
reproduces its deterministic 13/13 positive evidence and complete 157-outcome
harness. The new implementation narrows the prior secret, lifecycle and
reopened-Draft gaps, and all previously resolved regressions remain closed.

Approval renewal is still withheld. Three prior S1 blockers remain open, and
one new S2 blocker affects canonical-state discovery:

1. flow-style and plural-container credentials still bypass scanning;
2. lifecycle positives use state and role routes that canonical workflowctl
   cannot produce;
3. reopened Draft supersession authority can still be replaced after the
   transition;
4. the production checker ignores workflowctl's supported `CODEX_HOME` root.

## Delta review

The exact remediation range is
`cd8550bd63a4ac4adad93affd0c81e980110a23a..f5dc5b8658a76f0d30bab20e1eb6be20bb320c44`.
It contains one commit:

- `f5dc5b8658a76f0d30bab20e1eb6be20bb320c44` —
  close canonical lifecycle review gaps.

The 90 insertions and 45 deletions affect only:

- `CHANGELOG.md`;
- `docs/feature/v0-1-project-management/implementation-plan.md`;
- `docs/project-management.md`.

All delta files and the complete 14-file base-to-head diff were reconciled.
`git diff --check` passes with no unclassified changes.

## Finding revalidation

### PRR-003 — Open

Ordinary nested, Unicode-escaped and singular sensitive-key cases now fail.
The stable fingerprint remains open because flow-style nested objects and
plural credential containers such as `apiKeys` still receive `SECRETS PASS`
and aggregate PASS.

### PRR-004 — Open

The checker now recognizes state schema 2 and workflow-supported routed message
types, but its positive matrix is still not canonical. workflowctl rejects the
matrix state as missing `updatedAt`, and the matrix contains incomplete
feature/GoalRun invariants. It also permits authority routes forbidden by the
approved design.

### PRR-006 — Open

Basic missing and unsynchronized reopen evidence now fails, but the current
evidence is not bound to the immutable `Accepted → Draft` transition. A later
synchronized Draft commit can append a replacement Superseded row and
authority decision while retaining aggregate PASS.

### PRR-005, PRR-002 and PRR-001 — Resolved

Complete GitHub pagination and all prior governance, authority, mutation and
error-output regressions remain green in the refreshed harness.

## Blocking findings

### PRR-003 (S1) — Structured credential variants still bypass scanning

Two exact-head fixtures unexpectedly pass:

- a credential under a flow-style `public.vendor.api.key` object;
- a credential beneath the plural container `public.vendor.apiKeys`.

Required remediation:

- recursively parse every supported structured-text form or fail closed;
- normalize singular and plural sensitive containers;
- keep diagnostics redacted;
- add both exact fixtures to the stock harness.

### PRR-004 (S1) — Lifecycle positives remain unrepresentable

The stock lifecycle matrix uses a shallow hand-authored state that workflowctl
rejects. It also encodes `User + Main` for `Deferred → Draft`, although the
approved design requires `Requirements + Main`, and `Requirements + Main` for
`In Progress → Deferred`, although the design requires `User + Main`.

Required remediation:

- validate the full canonical workflowctl state invariants;
- align every route with the approved transition table;
- produce every positive transition through actual workflowctl operations;
- retain negative coverage for impossible recovery and role swaps.

### PRR-006 (S1) — Reopened Draft authority remains replaceable

After a valid reopen, a later Draft commit can append a second Superseded row,
later fabricated decision and synchronized plan/portfolio ChangeRecords. The
original immutable transition decision remains unchanged, yet the checker
returns PASS.

Required remediation:

- bind actor, time, reason, submitted commit, status decision and message
  lineage to the original `Accepted → Draft` transition;
- prohibit a replacement Superseded row for an already superseded Accepted
  record unless separately authorized by an explicit compensating transition;
- retain both simple mismatch and synchronized replacement regressions.

### PRR-007 (S2) — Canonical-state discovery ignores CODEX_HOME

workflowctl honors `CODEX_HOME`; the production checker always resolves
`os.userInfo().homedir/.codex`. A known-valid Ready state under an isolated
`CODEX_HOME` passes in the harness build but fails canonical-state discovery
with the unmodified production checker.

Required remediation:

- use the same Codex-root semantics as workflowctl;
- retain repository/common-dir and alias protections;
- run the unmodified production checker against workflowctl-generated state
  under both standard and isolated roots.

## Validation

- Previous cycle-eight JSON digest: PASS,
  `d4e46819fb1354acb0abed7c44baabefb44f9d7a54b236b52b2c88a46d07543c`.
- Complete base-to-head `git diff --check`: PASS.
- Exact-head positive checker: PASS twice, byte-identical SHA-256
  `c9f133f003012256f36b2725ff2ed7bf193a5186eae72c69bce08584943e37f8`.
- Refreshed harness: PASS — 114 expected failures, 25 expected passes, six
  expected errors and twelve mutant kills; SHA-256
  `87af89c09887427b558c1bf97c5e82ce29912794d7527e7d9478793206a56d9d`.
- Primary forward-risk validation: FAIL; SHA-256
  `64efd934bac14e7a1bc64e0e6f2e34e58df3c60586b6eb4555caff0a11e82837`.
- Independent fresh-context audit: FAIL; SHA-256
  `1141280f5ac81f799ca9d386e71b13dfecdbcf17ca4df406ea57d875c961d585`.
- GitHub status checks: UNKNOWN; the live PR returned an empty rollup.

At final observation, the PR was open, non-draft and mergeable at the exact
routed base/head. Merge was not requested and no GitHub review was published.

## Decision

**REQUEST_CHANGES**

Open blocking findings: `PRR-003`, `PRR-004`, `PRR-006`, `PRR-007`.

The canonical machine-readable record is
`pr-review-idea-trace-validation-1-f5dc5b8658a7-cycle-9.json`.
