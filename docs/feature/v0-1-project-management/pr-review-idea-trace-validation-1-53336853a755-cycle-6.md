# PR review: idea-trace-validation #1 — cycle 6

- Decision: `REQUEST_CHANGES`
- Repository: `zhanghao1903/idea-trace-validation`
- PR: <https://github.com/zhanghao1903/idea-trace-validation/pull/1>
- Base: `codex/v0-1-project-plan` at `9259d884459dd36bde6c089c3a15b368c985b617`
- Head: `codex/v0-1-project-management` at `53336853a7555e11ab3ac07ff6556091420772bb`
- Reviewed at: `2026-07-29T01:21:16Z`
- Mode: read-only; no GitHub review/comment was published and no merge was attempted

## Outcome

The one-commit, ten-file authority-contract remediation is internally consistent, and
the supplied evidence reproduces at the routed head. The 102-case harness closes every
previously enumerated cycle-five instance. Approval remains withheld because `PRR-003`
is still reproducible under the same semantic-governance-security fail-open fingerprint.

The strongest reproduction is contained in the supplied harness itself: its designated
valid `Accepted` state uses fabricated 64-hex lifecycle message IDs, nonexistent GitHub
PR/check references, and an ordinary empty commit as external merge proof. The checker
does not resolve any of those claims to durable authority and returns all-green `PASS`.

## Re-review delta

Cycle five reviewed head `695a13c3f210088accd2d6a9bf835242d95d1546`.
Cycle six adds commit `53336853a7555e11ab3ac07ff6556091420772bb`:

- all eight Draft plans add `LifecycleEvidence: None`;
- `docs/project-management.md` defines the exact authority-bundle evidence contract;
- `CHANGELOG.md` records the remediation.

The delta is 34 insertions across ten files. The full base-to-head 14-file diff and
previous-to-current commit were reconciled. There are no excluded or unclassified
changes, and `git diff --check` passes.

## Finding

### PRR-003 — S1 blocking: checker still authorizes forged lifecycle evidence and unsafe content

Status: `open`
Fingerprint: `testing:v0-1-project-plans-checker:semantic-governance-security-fail-open`

The tracked contract says any non-Draft status must be based on exact durable lifecycle,
Git/PR/Review, required-check, external-merge, and AcceptanceOwner authority. Arbitrary
actor/feature/branch text, generic URLs, or merely well-shaped SHAs are explicitly not
authority.

The checker reads a repository-authored JSON bundle and validates field shapes, syntax,
commit reachability, and ordering. It does not:

- resolve any 64-hex message ID against durable Engineering Lifecycle state;
- query the referenced GitHub PR, head, required checks, or merge;
- prove that the claimed external merge commit merged the reviewed implementation head;
- authenticate the asserted AcceptanceOwner decision;
- distinguish the workflow's `APPROVE` CodeReview decision from later `READY` or `MERGED`
  states.

The supplied harness's accepted fixture uses repeated-digit message IDs, PR
<https://github.com/zhanghao1903/idea-trace-validation/pull/42>, Actions run `4242`, and
an ordinary one-parent empty commit authored by `Checker Fixture` as merge proof. Read-only
GitHub API queries return 404 for both URLs, yet the checker returns 13/13 `PASS`.

Two other primary cases retain the same fail-open boundary:

- a four-backtick CommonMark fence containing shorter three-backtick lines is closed early
  because `renderedMarkdown` stores only the marker character; a hidden canonical table is
  then treated as authoritative;
- `AWS_ACCESS_KEY_ID=<production-shaped value>` is not recognized by the secret matcher.

Impact: a contributor can generate merge-authorizing evidence for a plan marked
`Accepted` without any real Requirements, Review, PR, checks, merge, or AcceptanceOwner
decision. The same gate can treat non-rendered content as canonical or permit a committed
credential, and downstream plans may then trust a forged dependency state.

Required remediation:

1. Resolve every authority reference against durable lifecycle and GitHub state instead
   of trusting repository-authored assertions.
2. Require an externally observed merge whose canonical proof contains the reviewed
   implementation head, and bind the real AcceptanceOwner decision.
3. Accept only `APPROVE` as the CodeReviewResult decision before separate workflow
   `READY`/`MERGED` proof.
4. Implement CommonMark-equivalent fence delimiter handling and recognize
   `AWS_ACCESS_KEY_ID` plus equivalent terminal secret keys with redacted diagnostics.
5. Classify every reproduction as an expected failure, regenerate exact-head artifacts,
   and request re-review.

## Previous findings

| Finding | Prior status | Current status | Evidence |
| --- | --- | --- | --- |
| `PRR-003` | open | open | Stock cases close, but forged authority plus rendering/secret cases retain the same fail-open fingerprint |
| `PRR-002` | resolved | resolved | All cycle-two regressions remain in the exact-head 102-case passing suite |
| `PRR-001` | resolved | resolved | All original governance and error-output regressions remain covered |

## Validation

| Check | Result | Exact evidence |
| --- | --- | --- |
| Prior immutable report | PASS | cycle-five JSON SHA-256 `e0a07266c759f435c5abb875652169cfba38754d8c083727f404d7ecc6d2a092` at report commit `564b9a2fd39002cbe0960b83a72cc7bfe19cb69a` |
| Live PR identity | PASS | open, non-draft and mergeable at the exact routed base/head |
| GitHub checks | UNKNOWN | empty `statusCheckRollup` |
| `git diff --check` | PASS | complete base-to-head diff |
| Exact-head checker | PASS | 13/13 twice, byte-identical; SHA-256 `0c00e95d679538e7aece7080e1cedab2b657eb58144c68a0693f85d0bd167a8c` |
| Supplied harness | PASS | 80 expected failures, 6 expected passes, 5 expected errors, 11 killed mutants; SHA-256 `6529ddcba2516d3c8e3583491fafb931075cc468c93ab773dc9467869ad53a5b` |
| Primary forward-risk suite | FAIL | three invalid snapshots received PASS; SHA-256 `9d1963515c704cb8ec23d112d3fdf492b755936de25d8895a7e6aa5614168170` |
| GitHub authority probes | FAIL | fixture PR #42 and Actions run 4242 both return HTTP 404 |
| Independent fresh-context audit | FAIL | independently reproduces forged Accepted authority with an empty one-parent merge-proof commit; SHA-256 `91c89b1da1cafc19aaff6bf6d9d2bfabd3af490a77a3eaed83752cb6af4797da` |

Runtime, browser, deployment, DNS, HTTPS, backup and restore checks were not run because
this PR is documentation-only and the approved plan assigns those checks to later
independent IP lifecycles.

## Approval renewal

- Previous findings revalidated: yes
- Delta fully classified: yes
- Full current-head validation completed: yes
- Independent pass completed: yes
- Renewal result: `WITHHELD`
- Merge action: `NOT_REQUESTED`

The next re-review must use a new exact live head and refreshed PR evidence digests. Valid
content must retain deterministic `PASS`, while each forged-authority, rendering, and
credential fixture must fail under its intended check without revealing credential values.
