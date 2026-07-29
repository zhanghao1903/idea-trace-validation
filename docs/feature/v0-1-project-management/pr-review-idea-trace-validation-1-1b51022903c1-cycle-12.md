# PR Review: idea-trace-validation #1 — Cycle 12

## Decision

`REQUEST_CHANGES`

Approval renewal is withheld for exact head
`1b51022903c16909e99fb1c9b049baa42b55ceee`.

Cycle twelve closes validator-provenance finding PRR-004 and the direct
cross-document metadata contradiction in PRR-009. It does not close PRR-003
or PRR-008, and the new approval projection exposes two additional authority
and audit-history blockers.

## Reviewed snapshot

| Field | Value |
| --- | --- |
| Repository | `zhanghao1903/idea-trace-validation` |
| PR | `#1` |
| Base | `codex/v0-1-project-plan` @ `9259d884459dd36bde6c089c3a15b368c985b617` |
| Head | `codex/v0-1-project-management` @ `1b51022903c16909e99fb1c9b049baa42b55ceee` |
| Previous head | `59cb2947802402a30bd307b2d51b31fb8335eb90` |
| Reviewed at | `2026-07-29T14:10:51Z` |
| Mode | Read-only; no GitHub review publication or merge |

The live PR was open, non-draft and GitHub-mergeable at the exact routed
base/head immediately before this record was sealed. GitHub reported no commit
status contexts.

## Blocking findings

### PRR-003 — S1 — Legal source-comment forms still bypass credential scanning

The new stock fixture covers one single-line block comment, but the production
parser still lets comment contents and line boundaries change key identity.
A clean committed object using
`apiKeys /* reason: harmless */ :` with a non-placeholder credential returns
exit `0`, aggregate `PASS` and `SECRETS: PASS`. An independent pass reproduced
the same result with normally formatted multiline comment trivia.

- Fingerprint:
  `testing:v0-1-project-plans-checker:semantic-governance-security-fail-open`
- Primary evidence:
  `/private/tmp/cycle12-comment-secret-repro.json`
- Primary evidence SHA-256:
  `da4e2c0f494fed2f30dd9ec5bef37cc100b811f6743fae10276124b770708fe6`
- Required remediation: tokenize comments across complete source structures,
  or conservatively reject unparseable syntax, and add delimiter-bearing plus
  multiline value-redacted regressions.

### PRR-008 — S1 — The narrowed allowlist still rejects planned future artifacts

The checker now permits ordinary non-doc source and test files but rejects
every new path under `docs/`. IP-07 explicitly requires
`docs/demo-script.md`; independent lifecycle requirements, designs and plans
will also be documentation artifacts. A clean descendant adding only the
planned demo document fails `FILES` as unexpected. The independent pass also
shows a harmless `tests/fixtures/project-management.md` is rejected solely by
basename.

- Fingerprint:
  `correctness:v0-1-project-plans-checker:repository-wide-tracked-file-allowlist-blocks-implementation`
- Primary evidence:
  `/private/tmp/cycle12-doc-allowlist-repro.json`
- Primary evidence SHA-256:
  `979f662df375103b60895c042a7e3d16585a140e3ea99a96d61a7b8e68de4f31`
- Required remediation: scope exact-file enforcement to management artifacts
  owned by this contract and identify parallel ledgers from ledger-shaped
  content rather than basename alone.

### PRR-010 — S1 — Management plan approval is not resolved from durable authority

The three documents now repeat the correct cycle-four approval identifiers,
but the checker compares them only with hard-coded constants supplied with the
checker. Because all independent IPs are Draft, canonical lifecycle loading is
skipped entirely. Running the exact head with `CODEX_HOME` pointing to a
nonexistent root still produces 13/13 `PASS` with
`authoritySnapshotDigest: None`.

- Fingerprint:
  `correctness:project-management:approved-plan-authority-not-durably-resolved`
- Evidence: `/private/tmp/cycle12-missing-plan-authority.json`
- Evidence SHA-256:
  `8269acfb8d71b013dcd448d9b93126b8ea57a505825f4e8029b1ffd5bb392a3f`
- Required remediation: resolve the management feature's durable
  `TechnicalPlanReviewRequest` and `TechnicalPlanReviewResult`, recompute the
  exact Git snapshot/composite, and include that observation in the authority
  digest even while all IPs remain Draft.

### PRR-011 — S2 — Approval metadata lacks an append-only ChangeRecord

Cycle twelve adds five authority-bearing approval fields to the Current
portfolio. `UpdatedAt` nevertheless remains
`2026-07-28T14:04:22Z`, and the only portfolio ChangeRecord still describes
initial creation. This violates the document's own rule that evidence changes
append a ChangeRecord in the same change set. The checker validates the stale
timestamp against that old row instead of comparing parent/head authority
metadata.

- Fingerprint:
  `correctness:project-management:approval-metadata-change-missing-change-record`
- Required remediation: append the approval-projection ChangeRecord, advance
  `UpdatedAt`, and add parent/head validation that authority-field changes
  require a new immutable row.

## Resolved and retained findings

| Finding | Status | Evidence |
| --- | --- | --- |
| PRR-004 | Resolved | Account-home active-package resolver, one manifest-matched candidate, ambiguity/injection rejection, validator identity in authority observations |
| PRR-009 | Resolved | Design, implementation plan, portfolio and durable cycle-four result agree on decision, commit, composite and message |
| PRR-006 | Resolved | Synchronized reopened-Draft replacement remains rejected |
| PRR-007 | Resolved | Default, absolute and literal-tilde lifecycle state roots remain equivalent |
| PRR-005 | Resolved | Complete GitHub pagination and 100/101 boundaries remain covered |
| PRR-002 | Resolved | Earlier authority and mutation regressions remain covered |
| PRR-001 | Resolved | Original governance and invocation-error regressions remain covered |

## Verification

| Check | Result |
| --- | --- |
| Prior cycle-11 JSON integrity | PASS — SHA-256 `e622f5417db8b84aa1217ea2ea9fc01aab3631946fb5fe736922b9c79d57f7bf` |
| `git diff --check` | PASS |
| Exact-head checker, two runs | PASS, byte-identical, 13/13 |
| Positive evidence SHA-256 | `8269acfb8d71b013dcd448d9b93126b8ea57a505825f4e8029b1ffd5bb392a3f` |
| Checker SHA-256 | `767844df9d0db04c4553d3458bd116568c3f30ae0822de1468d78e8412854bb2` |
| Harness SHA-256 | `437110c7ecccc18ae9c2461af84479e530e8c120e8961b5a661db78ae0b795b5` |
| Complete harness | PASS — 140 expected failures, 30 expected passes, 6 expected errors, 12 mutant kills |
| Harness result SHA-256 | `1b1fa27c01a425fa133f4e5dba11e026f03ac4c54bd87bd8f258ec62a988bd1d` |
| Primary forward-risk audit | FAIL — SHA-256 `79767fd70b1cfa20d1040ecd0bdcc0ae821add584ca28473336cc80b6ea36da6` |
| Independent fresh-context audit | FAIL — SHA-256 `d34b745f104255ee56f215fc53e44cfa65896eda3218d37a4e15a5e90289bea1` |
| Live PR identity | PASS — exact base/head, open, non-draft |
| GitHub status checks | UNKNOWN — zero status contexts reported |

Runtime unit, integration, browser, deployment, DNS, HTTPS and backup/restore
checks remain outside this documentation-only PR and belong to later
independent IP lifecycles.

## Required next cycle

1. Close PRR-003 with delimiter- and multiline-safe comment handling.
2. Close PRR-008 without weakening exact plan-file, true parallel-ledger or
   generated-artifact defenses.
3. Close PRR-010 by resolving management approval from durable exact-snapshot
   authority.
4. Close PRR-011 with the missing append-only portfolio record and parent/head
   validation.
5. Preserve every resolved regression, regenerate exact-head evidence, and
   request re-review at the new immutable head.
