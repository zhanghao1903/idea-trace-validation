# LP-05 runtime secrets

Create these three regular files in an operator-owned directory outside Git and
outside any Web or backup root:

- `postgres_password`: at least 32 random bytes;
- `ai_api_token`: at least 32 characters;
- `human_control_token`: an independently generated 32-byte base64url value (43
  characters).

Set the directory to exact mode `0700` and the three Compose source files to
exact mode `0644`, then point `SECRETS_ROOT` at the directory. Standalone Docker
Compose bind-mounts file-backed secrets without remapping ownership, so the read
bits are required by the fixed non-root container users. The `0700` parent
prevents every other host user from traversing to those files, while Compose
mounts each file only into its declared services. Do not reuse this permission
rule for the backup decryption identity: that file remains `0600` and is never
mounted into the normal topology.

Never copy real values into this repository, a Compose environment file, an
image layer, evidence, logs, screenshots, or a prompt. The preflight rejects any
other parent/file mode; the entrypoint rejects symlinks, empty/oversized files,
and equal AI/human credentials.
