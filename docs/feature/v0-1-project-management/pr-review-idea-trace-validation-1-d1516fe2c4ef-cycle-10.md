# PR Review — idea-trace-validation #1 — Cycle 10

- Repository: `zhanghao1903/idea-trace-validation`
- PR: <https://github.com/zhanghao1903/idea-trace-validation/pull/1>
- Base: `codex/v0-1-project-plan@9259d884459dd36bde6c089c3a15b368c985b617`
- Reviewed head: `codex/v0-1-project-management@d1516fe2c4efcab955136fbfecae6e89d7969ed5`
- Review mode: read-only
- Decision: **REQUEST_CHANGES**

## Summary

Cycle ten validates the one-commit, three-file remediation and independently
reproduces its deterministic 13/13 positive evidence and complete 162-outcome
harness. The reopened-Draft authority replacement defect is closed, and all
previously resolved regressions remain closed.

Approval renewal is still withheld. Two prior S1 blockers and one prior S2
blocker remain open:

1. an embedded flow-style plural credential container still bypasses scanning;
2. nested lifecycle state rejected by workflowctl still authorizes checker PASS;
3. literal-tilde `CODEX_HOME` resolves differently in workflowctl and the checker.

## Delta review

The exact remediation range is
`f5dc5b8658a76f0d30bab20e1eb6be20bb320c44..d1516fe2c4efcab955136fbfecae6e89d7969ed5`.
It contains one commit:

- `d1516fe2c4efcab955136fbfecae6e89d7969ed5` —
  close lifecycle authority review gaps.

The 59 insertions and 18 deletions affect only:

- `CHANGELOG.md`;
- `docs/feature/v0-1-project-management/implementation-plan.md`;
- `docs/project-management.md`.

All delta files and the complete 14-file base-to-head diff were reconciled.
`git diff --check` passes with no unclassified changes.

## Finding revalidation

### PRR-003 — Open

Top-level flow-style and indented plural-container fixtures now fail. The stable
fingerprint remains open because a source-like assignment whose value embeds a
flow object containing plural `apiKeys` receives `SECRETS PASS` and aggregate
PASS.

### PRR-004 — Open

Role routes and workflowctl-generated positive fixtures improved, but production
state validation is still shallow. An empty nested feature `plan` or
`requirements` artifact is rejected by workflowctl while the checker reports
13/13 PASS.

### PRR-006 — Resolved

The retained synchronized replacement attack now fails. Later Draft commits are
bound to the immutable first reopen's submitted commit, actor, time, reason,
decision, transition message, new requirements and prior acceptance evidence.

### PRR-007 — Open

Absolute `CODEX_HOME` now works. A literal leading tilde is expanded by
workflowctl but passed raw to `path.resolve` by the checker, so equivalent roots
produce different results.

### PRR-005, PRR-002 and PRR-001 — Resolved

Complete GitHub pagination and all prior governance, authority, mutation and
error-output regressions remain green in the refreshed harness.

## Blocking findings

### PRR-003 (S1) — Embedded flow credentials bypass scanning

The scalar matcher does not classify plural `apiKeys`, and recursive flow
parsing starts only after an anchored YAML-like key match. A source-like prefix
therefore hides the nested flow object from the secret scanner.

Required remediation:

- parse supported flow syntax regardless of its offset in a tracked line, or
  conservatively fail closed;
- add the exact embedded plural-container composition to the harness;
- keep all diagnostics value-redacted.

### PRR-004 (S1) — Canonical state validation remains incomplete

The local lifecycle validator accepts nested feature artifacts as shallow
objects. workflowctl requires exact artifact fields and cross-field invariants.
The differential reproductions make workflowctl fail while the production
checker still returns 13/13 PASS.

Required remediation:

- reuse workflowctl canonical validation or prove validator equivalence;
- cover every nested artifact, stage gate, queue, GoalRun, dispatch and
  cross-field invariant;
- require every workflowctl-invalid differential mutation to fail the checker.

### PRR-007 (S2) — Literal-tilde CODEX_HOME is incompatible

With isolated `HOME` and `CODEX_HOME=~/codex-home`, workflowctl expands the root
and validates the Ready state. The checker resolves a literal `~` directory and
fails to read canonical state.

Required remediation:

- use workflowctl-equivalent user expansion and path normalization;
- require literal-tilde and equivalent absolute roots to resolve the same state
  and authority digest.

## Validation

- Previous cycle-nine JSON digest: PASS,
  `3fb2c333089342aed2ef4c1e90bb172aa8c169da37659c07f3d4082da8219b8b`.
- Complete base-to-head `git diff --check`: PASS.
- Exact-head positive checker: PASS twice, byte-identical SHA-256
  `7e8a98d1c980976e17f07317f7a67da07b10cd25aeef65a5b6a53013b2e4af44`.
- Refreshed harness: PASS — 117 expected failures, 27 expected passes, six
  expected errors and twelve mutant kills; SHA-256
  `81ac725a19d61311e1ff51bccb03854632335bc9bf12b4b11f22e44c3e648e7c`.
- Primary forward-risk validation: FAIL; SHA-256
  `e2153c54e3834dbfe6f768ee483f3ce82dc306918ecca989514671cae61e9d2b`.
- Independent fresh-context audit: FAIL; SHA-256
  `26668b5e482d084572ab766b8047503925f3c438611cf2d6c39b725449c264db`.
- GitHub status checks: UNKNOWN; the exact head has zero reported commit
  statuses.

At final observation, the PR was open, non-draft and mergeable at the exact
routed base/head. Merge was not requested and no GitHub review was published.

## Decision

**REQUEST_CHANGES**

Open blocking findings: `PRR-003`, `PRR-004`, `PRR-007`.

The canonical machine-readable record is
`pr-review-idea-trace-validation-1-d1516fe2c4ef-cycle-10.json`.
