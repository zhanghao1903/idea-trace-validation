import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson, canonicalSha256 } from "./canonical-json.js";
import {
  assertCredentialReferenceName,
  deploymentHandoffAuthoritySha256,
  parseHandoff,
  parseProfile,
  type ClientConnectionProfileV1,
} from "./contracts.js";
import { resolveCredential } from "./credential.js";
import { createDeploymentHandoff } from "./create-deployment-handoff.js";
import {
  deriveProfileId,
  profileIdentity,
  removeProfile,
  storeProfile,
} from "./profile-store.js";
import { normalizeBaseUrl } from "./url.js";
import { verifyClientEvidence } from "./verify-client-evidence.js";
import { openapiCompatibilityDigest } from "./verify.js";

const roots: string[] = [];
const temporaryRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), "client-profile-unit-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  delete process.env.IDEA_VALIDATION_AI_TOKEN;
  delete process.env.HUMAN_CONTROL_TOKEN;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

const handoff = () => {
  const authority = {
    schemaVersion: 1 as const,
    kind: "idea-validation-deployment-handoff" as const,
    baseUrl: "https://idea.example.test",
    openapiUrl: "https://idea.example.test/openapi.json",
    releaseId: "release-1",
    sourceCommit: currentCommit,
    skillCommit: currentCommit,
    skillVersion: "0.1.0",
    skillTreeSha256: "d".repeat(64),
    openapiSha256: "c".repeat(64),
    declaredAiScopes: ["idea:write"],
    credentialId: "ai-primary",
    expiresAt: null,
    issuedAt: "2026-08-05T00:00:00Z",
  };
  return {
    ...authority,
    authoritySha256: deploymentHandoffAuthoritySha256(authority),
  };
};

const profile = (): ClientConnectionProfileV1 => {
  const value: ClientConnectionProfileV1 = {
    schemaVersion: 1,
    kind: "idea-validation-client-profile",
    profileId: "profile_000000000000000000000000",
    profileRevision: 1,
    baseUrl: "https://idea.example.test",
    openapiUrl: "https://idea.example.test/openapi.json",
    releaseId: "release-1",
    sourceCommit: "a".repeat(40),
    skill: {
      commit: "b".repeat(40),
      version: "0.1.0",
      treeSha256: "d".repeat(64),
    },
    clientId: "codex-client-01",
    displayName: "Codex test client",
    credential: {
      id: "ai-primary",
      fingerprint: `sha256:${"e".repeat(64)}`,
      source: { kind: "ENV", name: "IDEA_VALIDATION_AI_TOKEN" },
      expiresAt: null,
    },
    declaredAiScopes: ["idea:write"],
    validation: {
      connection: "VERIFIED",
      openapi: "VERIFIED",
      credentialPresence: "PRESENT",
      credentialUsability: "UNVERIFIED",
      verifiedAt: "2026-08-05T00:00:00Z",
      credentialEvidence: null,
    },
    issuedAt: "2026-08-05T00:00:00Z",
    updatedAt: "2026-08-05T00:00:00Z",
  };
  value.profileId = deriveProfileId(profileIdentity(value));
  return value;
};

describe("client profile contracts", () => {
  it("accepts closed canonical handoff and profile contracts", () => {
    expect(parseHandoff(handoff())).toEqual(handoff());
    expect(parseProfile(profile())).toEqual(profile());
    expect(canonicalJson(handoff())).toBe(
      canonicalJson(parseHandoff(handoff())),
    );
    expect(canonicalSha256(handoff())).toHaveLength(64);
  });

  it("rejects unknown fields, unordered scopes, invalid attribution and human references", () => {
    expect(() => parseHandoff({ ...handoff(), extra: true })).toThrow(
      "HANDOFF_FIELDS_INVALID",
    );
    expect(() =>
      parseHandoff({
        ...handoff(),
        declaredAiScopes: ["project:write", "idea:write"],
      }),
    ).toThrow("DECLARED_SCOPES_INVALID");
    expect(() => parseProfile({ ...profile(), displayName: " bad" })).toThrow(
      "DISPLAY_NAME_INVALID",
    );
    expect(() => assertCredentialReferenceName("HUMAN_CONTROL_TOKEN")).toThrow(
      "HUMAN_CONTROL_CREDENTIAL_FORBIDDEN",
    );
  });

  it("rejects a release claim changed outside the bound authority envelope", () => {
    expect(() =>
      parseHandoff({ ...handoff(), releaseId: "release-2" }),
    ).toThrow("HANDOFF_AUTHORITY_MISMATCH");
  });

  it("normalizes only HTTPS origins and explicit loopback HTTP", () => {
    expect(normalizeBaseUrl("https://idea.example.test/")).toBe(
      "https://idea.example.test",
    );
    expect(() =>
      normalizeBaseUrl("https://user:pass@idea.example.test/"),
    ).toThrow("BASE_URL_INVALID");
    expect(() => normalizeBaseUrl("https://idea.example.test/path")).toThrow(
      "BASE_URL_INVALID",
    );
    expect(() => normalizeBaseUrl("http://idea.example.test/")).toThrow(
      "BASE_URL_HTTPS_REQUIRED",
    );
    expect(normalizeBaseUrl("http://127.0.0.1:4000/", true)).toBe(
      "http://127.0.0.1:4000",
    );
  });
});

describe("secure credential resolution", () => {
  it("reads env and restricted files without exposing the token", async () => {
    const token = "env-token-abcdefghijklmnopqrstuvwxyz-123456";
    process.env.IDEA_VALIDATION_AI_TOKEN = token;
    const fromEnv = await resolveCredential({
      kind: "ENV",
      name: "IDEA_VALIDATION_AI_TOKEN",
    });
    expect(fromEnv.token).toBe(token);
    expect(fromEnv.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(fromEnv.fingerprint).not.toContain(token);

    const file = path.join(temporaryRoot(), "token");
    writeFileSync(file, token, { mode: 0o600 });
    expect(
      (await resolveCredential({ kind: "FILE", path: file })).fingerprint,
    ).toBe(fromEnv.fingerprint);
  });

  it("rejects broad file permissions, symlinks and a known human token", async () => {
    const root = temporaryRoot();
    const target = path.join(root, "token");
    writeFileSync(target, "file-token-abcdefghijklmnopqrstuvwxyz-123456", {
      mode: 0o644,
    });
    await expect(
      resolveCredential({ kind: "FILE", path: target }),
    ).rejects.toThrow("CREDENTIAL_FILE_PERMISSIONS");
    chmodSync(target, 0o600);
    const link = path.join(root, "token-link");
    symlinkSync(target, link);
    await expect(
      resolveCredential({ kind: "FILE", path: link }),
    ).rejects.toThrow("CREDENTIAL_SOURCE_INVALID");
    process.env.IDEA_VALIDATION_AI_TOKEN =
      "shared-token-abcdefghijklmnopqrstuvwxyz-123456";
    process.env.HUMAN_CONTROL_TOKEN = process.env.IDEA_VALIDATION_AI_TOKEN;
    await expect(
      resolveCredential({ kind: "ENV", name: "IDEA_VALIDATION_AI_TOKEN" }),
    ).rejects.toThrow("HUMAN_CONTROL_CREDENTIAL_FORBIDDEN");
  });

  it("rejects a missing environment credential", async () => {
    await expect(
      resolveCredential({ kind: "ENV", name: "IDEA_VALIDATION_AI_TOKEN" }),
    ).rejects.toThrow("CREDENTIAL_REQUIRED");
  });
});

describe("profile store", () => {
  it("is byte-stable for identical input and requires explicit replacement for drift", async () => {
    const root = temporaryRoot();
    mkdirSync(path.join(root, "profiles"), { mode: 0o700 });
    const outputPath = path.join(root, "profiles", "client.json");
    const first = profile();
    expect(
      (await storeProfile({ outputPath, candidate: first, replace: false }))
        .changed,
    ).toBe(true);
    const bytes = readFileSync(outputPath, "utf8");
    const replay = profile();
    replay.updatedAt = "2026-08-05T01:00:00Z";
    expect(
      (await storeProfile({ outputPath, candidate: replay, replace: false }))
        .changed,
    ).toBe(false);
    expect(readFileSync(outputPath, "utf8")).toBe(bytes);

    const changed = profile();
    changed.displayName = "Replacement client";
    changed.profileId = deriveProfileId(profileIdentity(changed));
    await expect(
      storeProfile({ outputPath, candidate: changed, replace: false }),
    ).rejects.toThrow("PROFILE_UPDATE_REQUIRED");
    const replacement = await storeProfile({
      outputPath,
      candidate: changed,
      replace: true,
    });
    expect(replacement.profile.profileRevision).toBe(2);
    expect(replacement.profile.displayName).toBe("Replacement client");
  });

  it("removes only the profile and preserves its referenced secret", async () => {
    const root = temporaryRoot();
    const outputPath = path.join(root, "client.json");
    const tokenPath = path.join(root, "token");
    writeFileSync(tokenPath, "token-value-that-remains-operator-owned-123456", {
      mode: 0o600,
    });
    const candidate = profile();
    candidate.credential.source = { kind: "FILE", path: tokenPath };
    candidate.profileId = deriveProfileId(profileIdentity(candidate));
    await storeProfile({ outputPath, candidate, replace: false });
    expect(await removeProfile(outputPath)).toBe(true);
    expect(readFileSync(tokenPath, "utf8")).toContain("operator-owned");
  });

  it("durably downgrades stale verified evidence after failed revalidation", async () => {
    const root = temporaryRoot();
    const outputPath = path.join(root, "client.json");
    const verified = profile();
    verified.validation.credentialUsability = "VERIFIED";
    verified.validation.credentialEvidence = {
      kind: "SYNTHETIC_IDEA_READBACK",
      requestId: "req_01KYZMC5YD76BMCGXBCPERA3M1",
      resourceId: "idea_01KYZMC5YD76BMCGXBCPERA3M1",
      idempotencyKeySha256: "f".repeat(64),
      observedClient: verified.clientId,
      observedDisplayName: verified.displayName,
      verifiedAt: "2026-08-05T00:00:00Z",
    };
    await storeProfile({ outputPath, candidate: verified, replace: false });

    const rejected = profile();
    rejected.updatedAt = "2026-08-05T01:00:00Z";
    const result = await storeProfile({
      outputPath,
      candidate: rejected,
      replace: false,
    });
    expect(result.changed).toBe(true);
    expect(result.profile.validation.credentialUsability).toBe("UNVERIFIED");
    expect(result.profile.validation.credentialEvidence).toBeNull();
    expect(
      parseProfile(JSON.parse(readFileSync(outputPath, "utf8"))).validation
        .credentialUsability,
    ).toBe("UNVERIFIED");
  });
});

describe("deployment handoff and client evidence", () => {
  it("generates deterministic non-secret release handoff bytes", async () => {
    const root = temporaryRoot();
    const output = path.join(root, "handoff.json");
    const generated = await createDeploymentHandoff({
      baseUrl: "https://idea.example.test",
      releaseId: "release-1",
      sourceCommit: currentCommit,
      skillCommit: currentCommit,
      skillVersion: "0.1.0",
      openapiPath: path.resolve("openapi/lp03.v1.json"),
      skillRoot: path.resolve("skills"),
      credentialId: "ai-primary",
      expiresAt: null,
      issuedAt: "2026-08-05T00:00:00Z",
      declaredAiScopes: ["project:write", "idea:write"],
      outputPath: output,
    });
    expect(generated.declaredAiScopes).toEqual(["idea:write", "project:write"]);
    expect(readFileSync(output, "utf8")).not.toMatch(
      /Bearer|token-value|HUMAN_CONTROL_TOKEN/u,
    );
    expect(parseHandoff(JSON.parse(readFileSync(output, "utf8")))).toEqual(
      generated,
    );
    expect(generated.authoritySha256).toHaveLength(64);
    expect(generated.skillTreeSha256).toHaveLength(64);
  });

  it("changes the OpenAPI digest for consumed contract drift", () => {
    const source = JSON.parse(
      readFileSync(path.resolve("openapi/lp03.v1.json"), "utf8"),
    ) as Record<string, unknown>;
    const original = openapiCompatibilityDigest(source);
    const mutate = (
      action: (copy: Record<string, unknown>) => void,
    ): string => {
      const copy = structuredClone(source);
      action(copy);
      return openapiCompatibilityDigest(copy);
    };
    expect(
      mutate((copy) => {
        const operation = (
          (copy.paths as Record<string, unknown>)["/api/v1/ideas"] as Record<
            string,
            unknown
          >
        ).post as Record<string, unknown>;
        operation.requestBody = {
          required: true,
          content: { "application/json": { schema: { type: "string" } } },
        };
      }),
    ).not.toBe(original);
    expect(
      mutate((copy) => {
        const components = copy.components as Record<string, unknown>;
        components.schemas = {};
      }),
    ).not.toBe(original);
    expect(
      mutate((copy) => {
        const operation = (
          (copy.paths as Record<string, unknown>)["/api/v1/ideas"] as Record<
            string,
            unknown
          >
        ).get as Record<string, unknown>;
        operation.parameters = [];
      }),
    ).not.toBe(original);
    expect(
      mutate((copy) => {
        const operation = (
          (copy.paths as Record<string, unknown>)["/api/v1/ideas"] as Record<
            string,
            unknown
          >
        ).post as Record<string, unknown>;
        operation.security = [];
      }),
    ).not.toBe(original);
  });

  it("requires a same-authority Codex and Claude evidence pair", async () => {
    const root = temporaryRoot();
    const base = {
      schemaVersion: 1,
      kind: "idea-validation-client-compatibility-evidence",
      clientVersion: "1.0.0",
      executionSurface: "isolated loopback fixture",
      skillCommit: "a".repeat(40),
      skillTreeSha256: "b".repeat(64),
      profileSha256: "c".repeat(64),
      profileSchemaVersion: 1,
      releaseId: "isolated-release",
      profileId: `profile_${"d".repeat(24)}`,
      credentialId: "isolated-ai",
      requestId: "req_01KYZMC5YD76BMCGXBCPERA3M1",
      resourceId: "idea_01KYZMC5YD76BMCGXBCPERA3M1",
      clientId: "isolated-client",
      displayName: "Isolated client",
      rawTranscriptSha256: "e".repeat(64),
      executedAt: "2026-08-05T00:00:00Z",
      checks: {
        initializationLoaded: true,
        workflowLoaded: true,
        authorizedWrite: true,
        publicRead: true,
        attributionMatch: true,
      },
    };
    const codex = path.join(root, "codex.json");
    const claude = path.join(root, "claude.json");
    writeFileSync(codex, JSON.stringify({ ...base, client: "CODEX" }));
    writeFileSync(claude, JSON.stringify({ ...base, client: "CLAUDE" }));
    await expect(verifyClientEvidence([codex, claude])).resolves.toHaveLength(
      2,
    );
    writeFileSync(
      claude,
      JSON.stringify({
        ...base,
        client: "CLAUDE",
        skillCommit: "f".repeat(40),
      }),
    );
    await expect(verifyClientEvidence([codex, claude])).rejects.toThrow(
      "CLIENT_EVIDENCE_AUTHORITY_MISMATCH",
    );
  });
});
