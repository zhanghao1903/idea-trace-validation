import { readFile } from "node:fs/promises";

import { verifyStaticCandidateConfiguration } from "./candidate/verify.js";
import { validateComposeStatic } from "./deploy/compose.js";
import { verifyFrozenArtifacts } from "./verify-frozen.js";

export const verifyReleaseReadiness = async (): Promise<void> => {
  await Promise.all([
    verifyStaticCandidateConfiguration(),
    validateComposeStatic(),
    verifyFrozenArtifacts(),
  ]);
  const [caddy, caddyTest, entrypoint] = await Promise.all([
    readFile("deploy/Caddyfile", "utf8"),
    readFile("deploy/Caddyfile.test", "utf8"),
    readFile("deploy/runtime/entrypoint.mjs", "utf8"),
  ]);
  for (const required of [
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    'Cache-Control "no-store"',
  ]) {
    if (!caddy.includes(required))
      throw new Error(`CADDY_POLICY_MISSING:${required}`);
  }
  if (!caddyTest.includes("tls internal") || !caddyTest.includes("local_certs"))
    throw new Error("CADDY_TEST_TLS");
  for (const required of [
    "lstat",
    "isSymbolicLink",
    "SECRET_VALUES_MUST_DIFFER",
    "execve",
  ]) {
    if (!entrypoint.includes(required))
      throw new Error(`ENTRYPOINT_POLICY_MISSING:${required}`);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyReleaseReadiness()
    .then(() => process.stdout.write("LP05_RELEASE_READINESS_PASS\n"))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "RELEASE_READINESS_FAILED"}\n`,
      );
      process.exitCode = 1;
    });
}
