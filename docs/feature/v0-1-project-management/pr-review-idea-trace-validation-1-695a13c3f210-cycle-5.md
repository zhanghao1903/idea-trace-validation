# PR review: idea-trace-validation #1 — cycle 5

- Decision: `REQUEST_CHANGES`
- Repository: `zhanghao1903/idea-trace-validation`
- PR: <https://github.com/zhanghao1903/idea-trace-validation/pull/1>
- Base: `codex/v0-1-project-plan` at `9259d884459dd36bde6c089c3a15b368c985b617`
- Head: `codex/v0-1-project-management` at `695a13c3f210088accd2d6a9bf835242d95d1546`
- Reviewed at: `2026-07-28T18:15:03Z`
- Mode: read-only; no GitHub review/comment was published and no merge was attempted

## Outcome

The one-commit, nine-file projection remediation is correct, and the supplied checker
evidence reproduces byte-for-byte. The 76-case suite closes every previously enumerated
cycle-four instance. Approval remains withheld because `PRR-003` is still reproducible
under the same semantic-governance-security fail-open fingerprint.

Seven additional invalid committed snapshots across the primary and independent audits
returned exit 0, overall `PASS`, and all 13 checks `PASS`. They cover non-rendered
canonical records, credential scanning, fabricated evidence, forged acceptance authority,
advancement while stale, and invalid rejection recovery.

## Re-review delta

Cycle four reviewed head `671649fb98d56cc11486e7329a4ecf19e3ec56e6`.
Cycle five adds commit `695a13c3f210088accd2d6a9bf835242d95d1546`:

- all eight independent plans add the exact
  `ReviewRejectionRecord: ImmutableReviewResult+ChangeRecord;NoRejectedAcceptanceRecord`
  projection;
- all eight plans add a PlanId-bound `Summary` matching the project ledger `NextStep`;
- `docs/project-management.md` adds the same machine-readable rejection projection.

The full base-to-head 14-file diff and the previous-to-current one-commit delta were
reconciled. There are no excluded or unclassified changes, and `git diff --check` passes.

## Finding

### PRR-003 — S1 blocking: checker still authorizes semantic governance, evidence and secret violations

Status: `open`  
Fingerprint: `testing:v0-1-project-plans-checker:semantic-governance-security-fail-open`

The repaired checker removes fenced code and HTML comments from its semantic view, but
retains four-space indented Markdown code while `tableCells` trims indentation. A canonical
portfolio table or ChangeRecord table moved into an indented code block is therefore treated
as the authoritative table and receives `PASS`.

The credential matcher accepts only one arbitrary prefix segment. A production-shaped
assignment such as `NEXT_PUBLIC_OPENAI_API_KEY=<redacted>` is not detected. The general
evidence predicate also accepts any forty-character hexadecimal value without proving that
it is a reachable commit or resolvable authority reference.

The independent fresh-context pass found three further instances:

- arbitrary actor, feature and branch strings plus an `example.com` link can mark the
  unchanged planning head `Accepted` without implementation, Review, required checks or
  merge proof; the supplied harness currently classifies an equivalent state as
  `EXPECTED_PASS`;
- a plan can advance `Draft` to `Ready` in the same commit that marks its projection
  `Stale`, despite the explicit fail-closed rule;
- a latest `Rejected` record may retain `Draft` rather than the required `In Progress`
  or `Blocked` recovery status.

These are not new fingerprints. They are additional deterministic reproductions of the
same open authorization-boundary defect. The impact is merge-authorizing evidence for
non-rendered records, a committed production credential, fabricated evidence, or lifecycle
states that bypass independent authority and may unlock downstream dependency gates.

Required remediation:

1. Parse authoritative Markdown using CommonMark-equivalent block semantics so code,
   comments and raw-HTML-only structures cannot satisfy table or prose contracts.
2. Detect sensitive terminal key names regardless of public/vendor prefix depth, with
   redacted diagnostics.
3. Resolve evidence to exact immutable authority: reachable repository commits and bound
   lifecycle/PR/check/merge/acceptance facts for state promotion.
4. Compare parent-to-head status, forbid business advancement while either projection is
   `Stale`, and require `Rejected` to recover to `In Progress` or `Blocked`.
5. Add every reproduction to the mutation-specific harness and stop classifying the forged
   future Accepted state as valid.

## Previous findings

| Finding | Prior status | Current status | Evidence |
| --- | --- | --- | --- |
| `PRR-003` | open | open | Stock cases close, but seven new cases retain the same fail-open fingerprint |
| `PRR-002` | resolved | resolved | All cycle-two regressions remain in the exact-head 76-case passing suite |
| `PRR-001` | resolved | resolved | All original governance and error-output regressions remain covered |

## Validation

| Check | Result | Exact evidence |
| --- | --- | --- |
| Prior immutable report | PASS | cycle-four JSON SHA-256 `e367a50c2446f5328dc9293da60a612a4a0fa6ec171553cf2850e1ddada41254` at report commit `66755e1a5a5a1155aa0390451f2eca5eb8bbbea0` |
| Live PR identity | PASS | open, non-draft, mergeable, exact routed base/head |
| GitHub checks | UNKNOWN | empty `statusCheckRollup` |
| `git diff --check` | PASS | complete base-to-head diff |
| Exact-head checker | PASS | 13/13; SHA-256 `782ed333578fc9dd005843b4c69806be8a67f1a09a23b3485f8e4909cefd490a` |
| Supplied harness | PASS | 63 expected failures, 3 expected passes, 5 expected errors, 5 killed mutants; SHA-256 `2e3bf8b5c27e8b63bf99568d1a42fb798b05da29d4197fa25b4bcd290f5ce1b3` |
| Primary forward-risk suite | FAIL | four invalid snapshots all received PASS; evidence SHA-256 `fc211cb49addf7aba9b5b8c1913ce43dca7cc9253b611b0b64223121c48a2ad6` |
| Independent fresh-context audit | FAIL | three additional invalid snapshots received PASS; evidence SHA-256 `1479e408bfcf2bd11709b53cdcbdf63a40624698bc28992eee7c6bfd43a4e2b6` |

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
content must retain deterministic `PASS`, while every primary and independent invalid
fixture must fail under its intended check without revealing credential values.
