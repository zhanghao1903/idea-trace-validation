# PR Review — `zhanghao1903/idea-trace-validation#1` @ `671649fb98d5` — Cycle 4

## 1. Review Metadata

| Field | Value |
| --- | --- |
| Repository | `zhanghao1903/idea-trace-validation` |
| Pull Request | `#1` — `docs: split v0.1 into independently managed plans` |
| Base | `codex/v0-1-project-plan` @ `9259d884459dd36bde6c089c3a15b368c985b617` |
| Head | `codex/v0-1-project-management` @ `671649fb98d56cc11486e7329a4ecf19e3ec56e6` |
| Reviewed at | `2026-07-28T17:01:20Z` |
| Review kind | `RE_REVIEW` |
| Review mode | `READ_ONLY` |
| Previous review | Cycle 3 @ `e2381bca4336cabc32eed0eb10c39c983edd7b8c`; `REQUEST_CHANGES` |
| Previous result integrity | SHA-256 `5a65f79bb1d32b360e043f143d5667361605c51df931cfe96ae1a9cd35055dde` |
| Report status | `CURRENT` |

## 2. Decision

- **Decision:** `REQUEST_CHANGES`
- **Mergeable under this review:** `false`
- **Blocking findings:** `PRR-003`
- **Approval renewal:** `WITHHELD`

The tracked two-commit remediation is correct, and all thirteen semantic cases listed in cycle 3 are now rejected. The required checker still returns a merge-authorizing 13/13 `PASS` for additional instances of the same semantic fail-open class, including hidden canonical structures, explicit Review-authority contradiction, forged acceptance summaries, missing Must content, unsynchronized next steps, embedded ledgers, common credential-key variants, spoofed link targets, and an output path that overwrites a tracked input.

## 3. Re-review Reconciliation

### Snapshot delta

| Item | Previous | Current |
| --- | --- | --- |
| Base | `9259d884459d…` | `9259d884459d…` |
| Head | `53c2a4ff6786…` | `671649fb98d5…` |
| Decision | `REQUEST_CHANGES` | `REQUEST_CHANGES` |
| Open blocker | `PRR-003` | `PRR-003` |

Commits reviewed:

- `ffba01db31064a50d358a32a06788131c4fd1ca8` — complete plan Review-authority contract
- `671649fb98d56cc11486e7329a4ecf19e3ec56e6` — normalize plan governance tables

All eight implementation-plan files changed and were reviewed. The complete 14-file base-to-head PR diff was reconciled, with no excluded or unclassified delta.

### Finding closure

| Finding | Previous | Current | Evidence |
| --- | --- | --- | --- |
| `PRR-001` | resolved | resolved | Original governance and error-output cases remain in the 35-invalid/two-error harness. |
| `PRR-002` | resolved | resolved | All cycle-two regressions remain rejected under their intended checks. |
| `PRR-003` | open | open | Prior examples are closed, but primary and independent passes reproduce additional fail-open cases with the same fingerprint. |

### Tracked remediation

- Acceptance and staleness table dividers now match their canonical headers.
- Every plan now states that Code Review rejection uses an immutable Review result plus `ChangeRecord` and does not create a `Rejected` `AcceptanceRecord`.
- The exact current documents pass all 13 checker buckets.
- The advertised positive output and supplied negative summary reproduce byte-for-byte.

### Plan-approval provenance

The independent pass raised a concern that the approved plan sources retain pre-review `PLAN_CHANGES_REQUESTED` and cycle-three `FAIL` header context. The immutable plan-review branch resolves the authorization question: commit `b4ef46c616cb7ddb559d560d5e75686dfcca9d80` records `PASS` for exact plan commit `70db0b5341186fa6bafe14a16ce1f69b707d916c` before implementation. Those headers describe the snapshot before its cycle-four review; they are not evidence that implementation bypassed plan approval.

## 4. Finding

### PRR-003 — [S1][Blocking][Testing] Checker still authorizes semantic governance and security violations

- **Location:** `docs/feature/v0-1-project-management/implementation-plan.md:245-310`
- **Commit:** `671649fb98d56cc11486e7329a4ecf19e3ec56e6`
- **Confidence:** High
- **Fingerprint:** `testing:v0-1-project-plans-checker:semantic-governance-security-fail-open`
- **Status:** open

The checker closes every previously listed instance, but several mandatory surfaces still depend on raw Markdown substrings, first-match structures, or no semantic parsing:

- a portfolio table, acceptance schema, primary trace, required transition, or Review boundary can exist only inside a code fence or HTML comment and still count;
- the project acceptance summary can be forged or duplicated, and a plan’s independent Must checklist can be replaced by `TBD`;
- a project `NextStep` can contradict the plan, and a secondary ledger can be embedded in an approved source;
- common credential keys such as `api_token` or `api_key`, including values in a tracked JSON source, evade the scanner;
- a portfolio link can point to the wrong file while preserving the expected filename in its anchor;
- `--output` can target `CHANGELOG.md`; the checker returns `PASS` and overwrites that tracked input after its clean-worktree check;
- the stock harness still passes after detailed acceptance-record validation loops are disabled because it asserts only the broad failed check ID.

These cases return exit `0`, overall `PASS`, all 13 checks `PASS`, and a reproducible digest. The VerificationEnvelope therefore cannot establish the approved semantic contract or safely authorize merge.

Required remediation:

1. Build one visibility-aware, cardinality-aware parsed document model and recognize canonical structures only from rendered content.
2. Parse the acceptance summary and PlanId-bound Must checklist with exact row, ID, pointer, authority and evidence rules.
3. Compare each project `NextStep` with its plan and reject secondary ledgers embedded in every approved source.
4. Resolve and compare exact canonical link targets.
5. Scan all tracked text formats for common credential-key variants using redacted diagnostics.
6. Reject output paths inside the repository and verify cleanliness again after output.
7. Require mutation-specific diagnostics in the harness and prove that removing any detailed validator makes the suite fail.

Verification must retain byte-stable 13/13 `PASS` for the valid exact head while every primary and independent invalid fixture returns the intended `FAIL` without leaking secret values. Unsafe output paths must return `ERROR` without changing tracked files.

## 5. Validation Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Prior immutable report integrity | PASS | Cycle-three Markdown and JSON match recorded digests. |
| Remote/live exact endpoints | PASS | Request, live PR, and remote refs match base `9259d884…` and head `671649fb…`. |
| `git diff --check` and full reconciliation | PASS | Two delta commits, eight reviewed delta files, 14 total PR files, no unclassified change. |
| Positive checker | PASS | 13/13; SHA-256 `a0dacaa60b48479aca0ce3d1a72d41c65e621a632e8429bd2360712e31758fae`. |
| Supplied harness | PASS | 35 expected `FAIL`, two expected `ERROR`; SHA-256 `424e355dee72f0004fef61fcbca08b30169e3a282953e25feb3167f49bb281b7`. |
| Primary forward-risk suite | FAIL | Eight invalid fixtures all receive 13/13 `PASS`; `/private/tmp/cycle4-forward-risk-summary.json`. |
| Independent fresh-context audit | FAIL | Eight invalid PASS bypasses, unsafe output-path PASS, future-state and mutation evidence; SHA-256 `fb1b339750593014016622734cc0a8c93bfac1d4ac762f2e0b973b08fae5e6cf`. |
| Immutable plan approval | PASS | Cycle-four plan report `b4ef46c…` approves exact plan snapshot `70db0b5…`. |
| GitHub status checks | UNKNOWN | GitHub returned an empty status list for `671649fb…`. |

No runtime unit, integration, browser, deployment, DNS, HTTPS, backup, or restore checks were run because this PR is documentation-only and assigns those proofs to later independent IP lifecycles.

## 6. Risk Assessment

| Category | Level | Residual risk |
| --- | --- | --- |
| Security and privacy | High | Credential variants and unsafe output paths can pass or corrupt tracked evidence. |
| Data integrity | High | Hidden authority structures, forged acceptance summaries, placeholder Must gates, and mismatched next steps can be certified. |
| Reliability and concurrency | Low | No runtime concurrency changes are present. |
| API compatibility | None | No runtime API, schema, Skill, or database artifact changed. |
| Deployment and rollback | Low | No deployment occurred; Git and immutable records preserve recovery. |

## 7. Required Action

- [ ] `PRR-003` — complete the semantic checker and precise harness for all primary and independent cases, regenerate exact-head evidence, update the PR envelope, and request lifecycle re-review.
- [x] `PRR-002` — preserve all cycle-two regressions.
- [x] `PRR-001` — preserve all original governance and error-output regressions.

## 8. Limitations

- GitHub exposes no status checks or logs for this head.
- The checker, harness, and raw outputs remain external task evidence rather than tracked commit-bound artifacts.
- Future runtime implementations and deployment systems are outside this documentation-only PR.

## 9. Machine-readable Summary

- Result: `docs/feature/v0-1-project-management/pr-review-idea-trace-validation-1-671649fb98d5-cycle-4.json`
- Schema: PR Review Result `1.1`

```yaml
review_kind: RE_REVIEW
decision: REQUEST_CHANGES
mergeable: false
head_sha: 671649fb98d56cc11486e7329a4ecf19e3ec56e6
blocking_findings:
  - PRR-003
validation_status: FAILED
report_status: CURRENT
```
