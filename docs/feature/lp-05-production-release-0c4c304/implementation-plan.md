# Implementation Plan: LP-05 0c4c304 生产版本发布

- Feature directory: `docs/feature/lp-05-production-release-0c4c304/`
- Branch: `codex/lp-05-production-release-0c4c304`
- DeliveryMode: `AGILE_REVIEWED`
- Requirements: `requirements.md`
- Design: `design.md`
- Source authority: `0c4c30410e9a2cc2c848047214654ab9df2585a2`
- Current phase: F3 — Implementation planning

## Scope

### In scope

- Bind this committed AGILE_REVIEWED release plan.
- Build and verify exact `linux/amd64` candidate `lp05-0c4c30410e9a-amd64` from a detached clean source.
- Read current production facts and generate a closed proposal without mutation.
- Obtain separate explicit authorization of the exact `proposalSha256`.
- Execute one controller-owned upgrade attempt with existing backup, migration, smoke, restore and rollback gates.
- Verify complete OpenAPI equality and Web/API behavior.
- Generate and validate one non-secret `DeploymentConnectionHandoffV1`.
- Record immutable verification, review, deployment and closure facts.

### Out of scope

- Application, schema, migration, runner, controller or host-contract code changes.
- DNS, OS/container-runtime upgrade, production DB restore or credential rotation.
- Tag, GitHub Release, package, registry or Skill marketplace publication.
- Reuse or rewriting of old candidate/proposal/attempt evidence.

## Execution Slices

| Slice | Work | Required proof | Stop condition |
| --- | --- | --- | --- |
| REL-01 Plan authority | Commit/push design and implementation plan; queue exact plan | exact plan commit and AC digest | Any requirements/plan mismatch |
| REL-02 Candidate | Detached exact source; full verify; buildx `linux/amd64`; manifest verification | source/tree/release/platform/image/archive/manifest identities | Dirty tree, wrong platform/source, failed gate |
| REL-03 Proposal | Read current production/toolchain/backup facts; canonicalize proposal | complete proposal JSON and `proposalSha256` | Missing/ambiguous/drifted fact |
| REL-04 Review and authorization | Push candidate verification record; AGILE_REVIEWED risk-focused Review; present proposal | exact reviewed head/checks plus explicit digest-bound user authorization | Review critical finding or absent/expired authorization |
| REL-05 Production attempt | Read-only preflight, then one controller request | immutable envelope, runtime binding and attempt journal | Any preflight or authority mismatch |
| REL-06 Deployment verification | external smoke, backup, isolated restore, post-restore smoke, evidence verification | `DEPLOYED`, evidence PASS, full OpenAPI equality | Forward failure triggers existing rollback |
| REL-07 Client handoff and closure | Generate/verify non-secret handoff; record result; explicit acceptance | handoff authority/digest and lifecycle closure | Handoff failure leaves client delivery incomplete |

## Detailed Steps

### REL-01 — Bind the plan

1. Verify the feature branch is based on the confirmed requirements commit and has no unrelated changes.
2. Commit `design.md` and `implementation-plan.md` together as the exact mode plan.
3. Compute the acceptance-criteria digest from the confirmed requirements snapshot using the lifecycle tool's
   defined canonical procedure.
4. Queue exact plan commit with `queue-agile-development`; do not request a STRICT plan review.
5. Start and activate one GoalRun whose objective explicitly excludes production mutation until proposal approval.

### REL-02 — Build exact candidate

1. Fetch and verify canonical merge commit/tree and reviewed head provenance.
2. Create a temporary detached worktree at `0c4c304…`; confirm normal and untracked status are empty.
3. Restore/install only lockfile-defined dependencies using the existing supported toolchain.
4. Run the full repository verification required by the candidate builder.
5. Build through Docker Buildx with `--platform linux/amd64` and pinned base image digests.
6. Verify the manifest in production provenance mode and independently hash manifest/archive bytes.
7. Confirm release ID, source/tree, platform, image ID, OpenAPI file/canonical digest, Web tree and migration
   catalog. Copy only verified artifacts into a mode-0700 staging root.
8. Record commands, results and non-secret digests in `verification.md`; never commit OCI archive bytes.

### REL-03 — Prepare proposal

1. Perform read-only public and host observations for target domain/IP, DNS/TLS, architecture/toolchain, current
   release/config/image, exact Docker identities, production database principal/name and backup destination.
2. Verify the current previous release is an upgrade target and preserve its exact identity.
3. Build the closed `DeploymentProposalV1` with existing required operation/exclusion arrays and backup policy.
4. Validate the proposal through the existing contract code, canonicalize it, compute `proposalSha256`, and run a
   secret scan on the JSON/output.
5. Save proposal bytes outside Git in a mode-0600 file and record only non-secret digest/identity facts in the
   feature verification record.

### REL-04 — Review and exact authorization

1. Commit/push the non-secret candidate/proposal preparation record and open/update the feature PR.
2. Run required exact-head CI and dispatch one `AGILE_REVIEWED` code review; remediate only critical blockers
   before requesting renewed review.
3. Present the complete proposal and `proposalSha256` to the user with target, source, previous release,
   operations, exclusions and 24-hour/one-attempt boundary.
4. Accept only a user response that explicitly identifies that digest. Build an authorization envelope from that
   response and verify it before any production mutation.

### REL-05 — Execute one production attempt

1. Re-run controller preflight from the deployment host/runner and compare every mutable fact to proposal.
2. If any fact differs, do not start the attempt; retire the proposal and return to REL-03.
3. Transfer the verified candidate and non-secret control records through the approved channel; secrets remain
   host-local and are referenced only by restricted files/environment.
4. Start exactly one attempt through `npm run deploy:lp05 -- --request <request.json>` using the independent
   release runner and state root.
5. Do not issue ad-hoc Docker/SQL/Caddy commands while the controller owns the attempt.

### REL-06 — Verify result and rollback boundary

1. Require terminal controller evidence for safety backup, migration, application/HTTPS readiness, first external
   smoke, post-deploy backup, isolated restore, production-unchanged proof, cleanup and second external smoke.
2. Independently fetch production health, Web pages, core API and OpenAPI over HTTPS.
3. Canonicalize the complete live OpenAPI and compare it to exact source artifact; verify the six SPA routes are
   absent from OpenAPI and still render as Web pages.
4. Run the existing evidence verifier against the complete bundle and preserve output digest.
5. On a forward failure, accept only controller-owned upgrade rollback. If rollback cannot prove previous app
   readiness and resource ownership, report `ROLLBACK_FAILED` and stop all automatic action.

### REL-07 — Generate handoff and close

1. After trusted `DEPLOYED`/evidence PASS, invoke the existing deployment-handoff generator with actual release,
   source, Skill and canonical OpenAPI facts.
2. Validate handoff schema, authority digest, Git bytes and secret exclusion; do not read the bearer value.
3. Deliver the non-secret handoff separately from the secure bearer channel and give Codex/Claude initialization
   examples by reference.
4. Commit/push final non-secret verification records, obtain required review/merge proof for the feature branch,
   then request explicit lifecycle acceptance/closure. Deployment success alone does not close the feature.

## Verification Matrix

| Requirement / AC | Verification |
| --- | --- |
| REQ-01–02 / AC-01–02 | Git commit/tree checks; full candidate builder; production manifest verifier; independent hashes |
| REQ-03–05 / AC-03–04 | closed proposal/envelope validators; canonical digest; target/current-release preflight |
| REQ-06–08 / AC-05, AC-08–09 | controller attempt journal; backup/restore/rollback and exact ownership evidence |
| REQ-09 / AC-06–07 | active external smoke; full canonical OpenAPI equality; SPA API/Web split |
| REQ-10–12 / AC-10–11 | existing handoff generator/verifier; Git authority; exact-value and structural secret scans |
| REQ-13–14 / AC-12–15 | append-only history checks; evidence verifier; Git diff scope; lifecycle acceptance record |

## Commands And Gates

Preparation and source verification:

```text
git status --short
git rev-parse 0c4c30410e9a2cc2c848047214654ab9df2585a2^{tree}
npm run verify
npm run release:lp05:candidate -- --platform linux/amd64
npm run release:lp05:verify-candidate -- --manifest <manifest> --reviewed-head <head> --merge-commit <merge> --reachable-from-base --production
```

Release verification uses only the existing commands documented in `docs/operations/lp05.md`, including:

```text
npm run deploy:lp05:validate
npm run deploy:lp05 -- --request <request.json>
npm run deploy:lp05:verify-evidence -- <evidence.json>
npm run client:profile:deployment -- <validated release inputs>
```

Exact command arguments and outputs are recorded in `verification.md`; secret-bearing paths and values are not.

## Rollback

- Before an attempt: no rollback is needed; retain proposal/candidate history and do not mutate production.
- After attempt start: use only existing upgrade rollback to restore previous app/image/config, never automatic
  production DB restore, down migration or fresh-install resource deletion.
- A handoff failure does not roll back a successful deployment, but the release remains incomplete for client
  delivery until the handoff verifier passes.

## Risks And Controls

| Risk | Control |
| --- | --- |
| ARM workstation produces unusable image | Buildx exact `linux/amd64`, manifest platform and OCI image-ID verification |
| Plan commits contaminate source identity | Detached source worktree at exact merge/tree |
| Stale proposal authorizes drift | Read-only preflight, canonical digest and one-attempt/24-hour envelope |
| Old proposal/candidate is reused | Release/source/manifest identity checks; new proposal only |
| OpenAPI file passes but runtime differs | Complete canonical live/frozen equality plus active route tests |
| Secret leaks into records | host-local secret references and exact/structural scans; no raw transcript commit |
| Controller defect invites manual workaround | Stop and create a separate Requirements feature |

## Documentation And Commit Plan

- Plan commit: this design and implementation plan only.
- Preparation commit: `verification.md` with candidate/proposal non-secret identities and commands.
- Final commit: deployment/handoff/evidence summary without raw secret or mutable external artifact.
- OCI archive, proposal/envelope/request containing operational paths, raw logs and credentials remain outside Git.
- All commits stay on this feature branch; production source remains exact merge `0c4c304…`.

## Open Decisions

None before candidate construction. Exact candidate identities, current previous-release identity and proposal
digest are runtime outputs; production waits for the user's separate digest-bound authorization.
