# LP-05 runtime secrets

Create these three regular files in an operator-owned directory outside Git and
outside any Web or backup root:

- `postgres_password`: at least 32 random bytes;
- `ai_api_token`: at least 32 characters;
- `human_control_token`: an independently generated 32-byte base64url value (43
  characters).

Set directory mode `0700` and file mode `0600`, then point `SECRETS_ROOT` at the
directory. Never copy real values into this repository, a Compose environment
file, an image layer, evidence, logs, screenshots, or a prompt. The entrypoint
rejects symlinks, empty/oversized files, and equal AI/human credentials.
