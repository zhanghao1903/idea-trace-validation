# API Workflows

Consult [`openapi/lp03.v1.json`](../../../openapi/lp03.v1.json) for complete
request and response fields. Use this table only to select an existing workflow.

| Intent             | Read authority first                                      | Existing write or read                                                                | Stop rule                                                                           |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Capture Idea       | Optional duplicate-oriented `GET /api/v1/ideas`           | `POST /api/v1/ideas`                                                                  | Preserve missing outcome as an explicit question; never invent proposer attribution |
| Read Idea          | `GET /api/v1/ideas/{ideaId}`                              | Same read with the requested `view`                                                   | A view is presentation, not identity                                                |
| Clarify Idea       | `GET /api/v1/ideas/{ideaId}` and select one open question | `POST /api/v1/ideas/{ideaId}/clarifications/{questionId}/answers`                     | Require known answer and current `expectedVersion`                                  |
| Promote Idea       | `GET /api/v1/ideas/{ideaId}`                              | `POST /api/v1/ideas/{ideaId}/promotions` with literal `PROMOTE`                       | No explicit promotion intent means no project                                       |
| Read project       | `GET /api/v1/projects/{projectId}`                        | Project, history, and collection GET routes                                           | Re-read before a versioned command                                                  |
| Transition project | Current project and allowed state                         | `POST /api/v1/projects/{projectId}/transitions`                                       | Never force a disallowed state                                                      |
| Record progress    | Current project and evidence IDs                          | `POST /api/v1/projects/{projectId}/progress-updates`                                  | Recording text is not a hidden transition                                           |
| Record attention   | Current project                                           | `POST /api/v1/projects/{projectId}/attention-items` or its event route                | Keep blocker, decision, and support semantics distinct                              |
| Record Evidence    | Current project                                           | `POST /api/v1/projects/{projectId}/evidence` or correction route                      | Do not fetch or embellish the locator                                               |
| Record conclusion  | Current project and referenced Evidence                   | `POST /api/v1/projects/{projectId}/conclusions`                                       | Conclusion is not human confirmation                                                |
| Role overview      | None                                                      | `GET /api/v1/experience/proposer/ideas` or `GET /api/v1/experience/executor/projects` | Follow `nextCursor` until null; reject cursor loops                                 |

For paginated reads, keep the last successful page visible to the user if a
later page fails. Use a bounded page ceiling and stop on a repeated cursor.

## Attribution

`actor`, `proposer`, and `role` fields are declared business attribution. The AI
bearer credential authorizes the AI write surface; it does not authenticate the
named person. Never describe the selected Web role as a signed-in user.
