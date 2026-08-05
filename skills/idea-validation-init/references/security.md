# Security Boundary

- Keep raw AI bearer bytes in a secure operator environment, restricted file or
  equivalent provider. Only the process that constructs the Authorization header
  may read them.
- Never paste a bearer into a prompt, command argument, URL, profile, Git file,
  log, screenshot, transcript or acceptance evidence.
- A profile stores only a domain-separated SHA-256 fingerprint and a source
  reference. Neither can authenticate a request or recover the token.
- Reject environment references containing `HUMAN`, `CONTROL`, `COOKIE`,
  `CAPABILITY`, `PASSWORD` or `DATABASE`. Reject an AI bearer equal to a known
  `HUMAN_CONTROL_TOKEN` value.
- Never request, read, forward or store the human-control token or scoped
  confirmation cookie. Explain the public human step and stop.
- If exposure is suspected, stop writes and ask the operator to rotate through
  an independent secure process. Do not delete versioned history to hide it.
- Do not claim rotation complete until the old token is independently shown to
  be unauthorized and a replacement profile has been explicitly accepted.
