# PR Review: #7 at `523abef4e31c`

- Decision: **APPROVE**
- Review mode: read-only
- Base: `codex/v0-1-project-plan` at `46e021d261fd8a663c83430a551f5674365ccf14`
- Head: `codex/lp-05-deployment-release` at `523abef4e31c48a4d0eaedb8fd340f41d6fda2ee`
- Reviewed at: `2026-08-03T06:02:48Z`

## Outcome

Cycle 5 closes both remaining blockers from Cycle 4. The controller no longer races an in-flight oracle against a hard-stop rejection: it requests cancellation at the deadline, joins the oracle ownership boundary, and starts rollback only after that boundary settles. Host Docker calls inherit the active oracle signal, while restore cleanup persists `QUIESCING` and requires consecutive empty observations before `CLEANED`.

The previous ignored-abort trigger is now ordered as `abort requested -> forward actor quiescent -> rollback`; the exact-head regression also proves no additional mutation after terminal return. Delayed restore Compose creation, migration, app startup, story replay, and a restore generation appearing after the first empty observation are covered by current-head tests. PRR-001 through PRR-004 remain resolved.

No new blocking finding was found in the 11-file `696859bcb186d100df9495ea39a413bd739112db..523abef4e31c48a4d0eaedb8fd340f41d6fda2ee` delta or its affected base-to-head paths.

## Re-review evidence

- All 11 delta files were classified and inspected; the complete PR remains 89 files and was reconciled through the prior full review plus this exact delta.
- The previous JSON result was reloaded with SHA-256 `558f8848221e616becd9bafdad230904408d2f4c61c627be28447ead220f1643`.
- `npm ci --ignore-scripts` used Node.js 24.14.0 and npm 11.16.0 and installed 364 locked packages.
- `npm run format:check`, `npm run lint`, `npm run typecheck`, and `npm run typecheck:lp05` passed.
- `npm run test:deployment:unit` passed: 6 files, 64 tests.
- Full-PR and Cycle 5 `git diff --check` passed.
- GitHub Actions run `30787607361` passed for the exact head: `verify` job `91604165359` and `lp05-candidate` job `91604507174`.

Reviewer-local `deploy:lp05:validate` could not start because the sandbox denied the `tsx` IPC socket; the requested sandbox escalation was unavailable because the approval service connection failed. This is an environment limitation, not a test failure. The exact-head `ci / verify` job ran the configured full verification chain, including the validator.

## Finding revalidation

| Finding | Status | Evidence |
| --- | --- | --- |
| PRR-001 | Resolved | External smoke still rejects caller-authored observations and derives active authority-bound evidence. |
| PRR-002 | Resolved | Production phases remain controller-owned execute/reconcile operations with no future evidence input. |
| PRR-003 | Resolved | Restore still re-inspects identities and executes `pg_restore` in the exact isolated container. |
| PRR-004 | Resolved | Exact CSP and same-host HTTPS redirect checks and negatives remain unchanged and green. |
| PRR-005 | Resolved | `runOracle` joins the signal-ignoring actor before rollback; Docker children inherit the oracle signal; exact-head ordering tests show no post-terminal mutation. |
| PRR-006 | Resolved | Restore cleanup starts after actor settlement, persists `QUIESCING`, reaps a late generation, and requires consecutive empty observations before `CLEANED`. |

## Limitations and boundary

- No production host, DNS, real secret, database, backup target, deployment, merge, or publication was touched.
- Local OCI/Compose candidate execution was not repeated; exact-head GitHub `lp05-candidate` is the configured authority for that environment.
- A separate sub-agent was not authorized, so the same reviewer performed a distinct second pass over cancellation propagation, oracle ownership, rollback ordering, restore lifecycle transitions, tests, and documentation.

The PR is ready under the configured review-only policy. Engineering Review does not merge it.
