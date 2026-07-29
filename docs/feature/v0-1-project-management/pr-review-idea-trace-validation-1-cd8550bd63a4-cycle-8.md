# PR Review — idea-trace-validation #1 — Cycle 8

- Repository: `zhanghao1903/idea-trace-validation`
- PR: <https://github.com/zhanghao1903/idea-trace-validation/pull/1>
- Base: `codex/v0-1-project-plan@9259d884459dd36bde6c089c3a15b368c985b617`
- Reviewed head: `codex/v0-1-project-management@cd8550bd63a4ac4adad93affd0c81e980110a23a`
- Review mode: read-only
- Decision: **REQUEST_CHANGES**

## Summary

Cycle eight validates the one-commit, three-file remediation and reproduces its
deterministic positive evidence and complete 143-outcome harness. The
production override/path-alias attacks are closed, and complete GitHub
pagination resolves `PRR-005`.

Approval renewal is still withheld. Primary and independent fresh-context
validation found three blocking S1 paths:

1. escaped and hierarchical structured-secret keys still bypass scanning;
2. the lifecycle registry is incompatible with canonical workflow authority
   and does not enforce Deferred source/recovery evidence;
3. reopened Draft authority can be replaced after the transition commit
   without invalidating PASS.

## Delta review

The exact remediation range is
`f6058de85c497ed91bdf2c80afe677c32f4d27ee..cd8550bd63a4ac4adad93affd0c81e980110a23a`.
It contains one commit:

- `cd8550bd63a4ac4adad93affd0c81e980110a23a` —
  close lifecycle authority review gaps.

The 57 insertions and 12 deletions affect only:

- `CHANGELOG.md`;
- `docs/feature/v0-1-project-management/implementation-plan.md`;
- `docs/project-management.md`.

All delta files and the complete 14-file base-to-head diff were reconciled.
`git diff --check` passes with no unclassified changes.

## Finding revalidation

### PRR-003 — Open

The production lifecycle override, path aliases and ordinary structured secret
fixtures now fail. The same security/testing fingerprint remains open because
nested `api.key` and JSON-escaped `api_key` forms still receive PASS.

### PRR-004 — Open

The checker now declares seven statuses and sixteen edges, but its authority
model is incompatible with the canonical workflow. It accepts only lifecycle
state schema 1 while workflowctl writes schema 2, depends on the unsupported
`PlanStatusDecision` message type, permits `Deferred → Ready` without an
explicit recovery decision, and accepts a defer projection from the wrong
durable source stage.

### PRR-005 — Resolved

All GitHub collections are now paginated with page, count, duplicate and digest
validation. Stock 100/101 file and review cases pass, and a separate 101-check
case confirms a required check on page two is found.

### PRR-002 and PRR-001 — Resolved

The refreshed harness retains every prior authority, mutation, governance and
error-output regression.

## Blocking findings

### PRR-003 (S1) — Structured secret keys still bypass scanning

The checker applies one raw-text sensitive-key expression. It does not
normalize JSON key escapes or derive hierarchical structured paths. A nested
`public.vendor.api.key` and a JSON-escaped `api_key` fixture both returned exit
0 and PASS.

Required remediation:

- normalize escaped structured keys before classification;
- parse or conservatively derive hierarchical paths;
- treat nested `api.key` and similar terminal paths as sensitive;
- keep diagnostics redacted and add both fixtures to the stock harness.

### PRR-004 (S1) — Lifecycle transitions remain incompatible with canonical authority

The installed Engineering Lifecycle writes state schema 2 and supports five
immutable message types. The checker hard-rejects state versions other than 1
and depends on an unsupported `PlanStatusDecision` type. Changing only a
known-valid fixture to schema 2 fails authority validation.

The independent pass also found:

- `Ready → Deferred` passes while the canonical feature is already at
  `CODE_REVIEW_PENDING`, not the durable Ready-stage source;
- `Deferred → Ready` passes without a recovery decision by reusing the old
  plan-review result.

Required remediation:

- consume canonical schema-2 state and workflow-supported messages;
- enforce exact durable source-stage sets per edge;
- require explicit immutable recovery authority for `Deferred → Ready`;
- cover every approved user/Requirements authority alternative;
- generate all end-to-end lifecycle fixtures through workflowctl.

### PRR-006 (S1) — Reopened Draft authority is not continuously validated

Starting with the harness's valid `Accepted → Draft` fixture, a later
same-status Draft commit replaced plan and portfolio lifecycle evidence with a
nonexistent all-zero bundle and added no `ChangeRecord`. The checker returned
PASS with `authoritySnapshotDigest=None`.

Required remediation:

- resolve lifecycle evidence for every Draft carrying lifecycle, acceptance or
  supersession history;
- continuously bind the latest superseded record and current Draft metadata to
  the exact canonical bundle;
- require synchronized change records for evidence changes;
- add unchanged and tampered post-reopen Draft fixtures.

## Validation

- Previous cycle-seven JSON digest: PASS,
  `0167f2f663e21c00631945d97f17d547fff20cc237134abdc6669f4ed24dead4`.
- Complete base-to-head `git diff --check`: PASS.
- Exact-head positive checker: PASS twice, byte-identical SHA-256
  `654d9906c241466e982ccb27f5bcf8a5dbd9451d17faa4b6dbbfb1f8c560701c`.
- Refreshed harness: PASS — 102 expected failures, 23 expected passes, six
  expected errors and twelve mutant kills; SHA-256
  `3da7b5eac91fcfeb443cabbfa9a410957bf312db38e51e16edcb31bd4c4ef7ad`.
- Independent 101-check pagination boundary: PASS; evidence SHA-256
  `17e8fecb88c4e7808ece3fb5fb9f5d23938efd13f21fd28cd00388d9518799bb`.
- Canonical workflow compatibility: FAIL; summary SHA-256
  `9c4540b644bdd79b31a73a750f327daa631ad0a672786ca85f5d17d6c909f78a`.
- Independent fresh-context audit: FAIL; SHA-256
  `772e03e2056e698bc508c0411114408e8f9b9386b2da481814637b73ff308be5`.
- GitHub status checks: UNKNOWN; the live PR returned an empty rollup.

The PR was open, non-draft and mergeable at the exact routed base/head when
observed. No rulesets or branch protection were reported. Merge was not
requested and no GitHub review was published.

## Decision

**REQUEST_CHANGES**

Open blocking findings: `PRR-003`, `PRR-004`, `PRR-006`.

The canonical machine-readable record is
`pr-review-idea-trace-validation-1-cd8550bd63a4-cycle-8.json`.
