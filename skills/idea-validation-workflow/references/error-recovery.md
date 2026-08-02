# Error Recovery

The error envelope and retry metadata in
[`openapi/lp03.v1.json`](../../../openapi/lp03.v1.json) are authoritative.

| Observation                                                                                 | Required response                                                                                                |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Network result unknown or retryable `INTERNAL_ERROR` after a write may have reached the API | Replay the exact method, path, body bytes, and `Idempotency-Key`; then publicly read the resource                |
| `IDEMPOTENCY_IN_PROGRESS`                                                                   | Wait only the advertised `retryAfterMs`, retry the same body/key a bounded number of times, then stop clearly    |
| `IDEMPOTENCY_CONFLICT` or `IDEMPOTENCY_KEY_REUSED`                                          | Stop. Replay only the original frozen intent; changed intent requires an explicit new key                        |
| `VERSION_CONFLICT`                                                                          | Re-read current version and allowed action; continue only with renewed intent and a new key                      |
| `REPORT_REVISION_CONFLICT`                                                                  | Re-read current report and project, rebuild from the current base, and use a new matching header/body request ID |
| Validation or report path error                                                             | Explain the bounded field path; correct only known data; changed body uses a new key                             |
| `WRITE_CREDENTIAL_REQUIRED`                                                                 | Stop and ask the operator to repair secure AI credential injection                                               |
| Human-control or capability error                                                           | Stop and hand off; the AI performs no replacement write                                                          |
| Not found, forbidden, or not allowed                                                        | Verify ID, scope, and current state; never substitute a different resource                                       |
| `SERVICE_NOT_READY`                                                                         | Retry readiness at 250/500/1000 ms, then return control without claiming success                                 |

Success requires a success envelope or an idempotent replay plus a matching
public read. HTTP completion, client output, and local evidence are insufficient
by themselves.

Never reuse a key after changing `expectedVersion`, `basedOnRevision`, report
content, selected action, or user intent. Never generate a fresh key merely
because an original request result is unknown.
