import { describe, expect, it } from "vitest";

import {
  createProductionResourceIdentity,
  verifyProductionUnchanged,
} from "./production-identity.js";
import { finalizeBackupManifest } from "./backup-manifest.js";
import { planRetention, type RetentionCandidate } from "./retention.js";
import {
  assertIsolatedTarget,
  assertLiveIsolatedTarget,
} from "./restore-evidence.js";
import { restoreEncryptedBackup } from "./restore.js";
import { canonicalSha256 } from "../shared/canonical-json.js";
import type { JsonRecord } from "../shared/contracts.js";

const candidate = (id: number): RetentionCandidate => ({
  manifest: {
    backupId: `backup_${id}`,
    createdAt: `2026-08-${String(id).padStart(2, "0")}T00:00:00.000Z`,
  },
  manifestPath: `/backups/backup_${id}.manifest.json`,
  ciphertextPath: `/backups/backup_${id}.dump.age`,
});

describe("LP-05 backup retention", () => {
  it("keeps newest seven and every pinned backup", () => {
    const all = Array.from({ length: 10 }, (_, index) => candidate(index + 1));
    const expired = planRetention(all, new Set(["backup_1"]));
    expect(expired.map((entry) => entry.manifest.backupId)).toEqual([
      "backup_3",
      "backup_2",
    ]);
  });

  it("rejects policy drift", () =>
    expect(() => planRetention([], new Set(), 5)).toThrow(
      "RETENTION_POLICY_INVALID",
    ));
});

describe("LP-05 isolated recovery", () => {
  const productionDatabase: JsonRecord = {
    containerId: "production-postgres",
    volumeName: "production-data",
    volumeMountId: "production-mount",
    systemIdentifier: "100",
    databaseName: "idea_validation",
    postgresVersion: "17.10",
    volumeLabelSha256: "a".repeat(64),
    containerLabelSha256: "b".repeat(64),
    databaseInstanceSha256: "",
  };
  productionDatabase.databaseInstanceSha256 = canonicalSha256(
    productionDatabase,
    ["databaseInstanceSha256"],
  );
  const production = createProductionResourceIdentity({
    targetId: "target_prod",
    composeProject: "idea-validation-prod",
    database: productionDatabase,
    app: {
      containerId: "production-app",
      imageId: `sha256:${"c".repeat(64)}`,
      configSha256: "d".repeat(64),
      containerLabelSha256: "e".repeat(64),
    },
    caddy: {
      containerId: "production-caddy",
      imageId: `sha256:${"f".repeat(64)}`,
      configSha256: "1".repeat(64),
      containerLabelSha256: "2".repeat(64),
      certificateSha256: "3".repeat(64),
    },
    releaseMarkerSha256: "c".repeat(64),
  });

  it("requires distinct restore project and resource identities", () => {
    assertIsolatedTarget(
      {
        kind: "ISOLATED",
        composeProject: "lp05-restore-abc",
        systemIdentifier: "200",
        volumeLabelSha256: "d".repeat(64),
        containerLabelSha256: "e".repeat(64),
        origin: "http://127.0.0.1:18081/",
        databaseHost: "127.0.0.1",
        databasePort: 15433,
        databaseName: "idea_validation_restore",
      },
      production,
    );
    expect(() =>
      assertIsolatedTarget(
        {
          kind: "ISOLATED",
          composeProject: "idea-validation-prod",
          systemIdentifier: "100",
          volumeLabelSha256: "a".repeat(64),
          containerLabelSha256: "b".repeat(64),
          origin: "http://127.0.0.1:18081/",
          databaseHost: "127.0.0.1",
          databasePort: 15433,
          databaseName: "idea_validation_restore",
        },
        production,
      ),
    ).toThrow("RESTORE_PROJECT");
  });

  it("proves production before/after canonical equality", () => {
    const after = structuredClone(production) as JsonRecord;
    expect(verifyProductionUnchanged(production, after)).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    (after.app as JsonRecord).imageId = "changed";
    expect(() => verifyProductionUnchanged(production, after)).toThrow(
      "PRODUCTION_RESOURCES_CHANGED",
    );
  });

  it("rejects every live destination mismatch before starting a subprocess", async () => {
    const database: JsonRecord = {
      targetId: "target_prod",
      project: "idea-validation-prod",
      containerId: "prod-postgres",
      volumeName: "prod-data",
      volumeMountId: "prod-mount",
      systemIdentifier: "100",
      databaseName: "idea_validation",
      postgresVersion: "17.10",
      databaseInstanceSha256: "",
    };
    database.databaseInstanceSha256 = canonicalSha256(database, [
      "databaseInstanceSha256",
    ]);
    const manifest = finalizeBackupManifest({
      schemaVersion: "1.0",
      backupId: "backup_recovery",
      purpose: "POST_DEPLOY_RECOVERABILITY",
      envelopeId: "auth_recovery",
      attemptId: "deploy_recovery",
      targetId: "target_prod",
      sourceDatabase: database,
      sourceRelease: {
        releaseId: "release-prod",
        sourceCommit: "a".repeat(40),
        imageId: `sha256:${"b".repeat(64)}`,
        configSha256: "c".repeat(64),
      },
      candidateManifestSha256: "d".repeat(64),
      migrationCatalogSha256: "e".repeat(64),
      syntheticStorySha256: "f".repeat(64),
      createdAt: "2026-08-03T00:00:00.000Z",
      ciphertext: {
        basename: "backup_recovery.dump.age",
        sizeBytes: 1024,
        sha256: "1".repeat(64),
      },
      encryption: {
        algorithm: "age-v1",
        recipientFingerprint: "2".repeat(64),
      },
      tool: {
        pgDumpVersion: "17.10",
        ageVersion: "1.2.1",
        format: "custom",
      },
      verification: {
        status: "PASS",
        verifiedAt: "2026-08-03T00:00:01.000Z",
        pgRestoreListSha256: "3".repeat(64),
      },
    });
    const declared: JsonRecord = {
      kind: "ISOLATED",
      composeProject: "lp05-restore-abc",
      systemIdentifier: "200",
      volumeLabelSha256: "4".repeat(64),
      containerLabelSha256: "5".repeat(64),
      origin: "http://127.0.0.1:18081/",
      databaseHost: "127.0.0.1",
      databasePort: 15433,
      databaseName: "idea_validation_restore",
    };
    const fields = [
      ["databaseHost", "::1"],
      ["databasePort", 15434],
      ["databaseName", "other_restore"],
      ["composeProject", "lp05-restore-other"],
      ["systemIdentifier", "201"],
      ["volumeLabelSha256", "6".repeat(64)],
      ["containerLabelSha256", "7".repeat(64)],
    ] as const;
    for (const [field, value] of fields) {
      let spawnCalls = 0;
      await expect(
        restoreEncryptedBackup({
          manifest,
          expected: {
            envelopeId: "auth_recovery",
            attemptId: "deploy_recovery",
            targetId: "target_prod",
            candidateManifestSha256: "d".repeat(64),
            databaseInstanceSha256: String(database.databaseInstanceSha256),
            syntheticStorySha256: "f".repeat(64),
          },
          ciphertextPath: "/safe/backup.dump.age",
          identityPath: "/safe/identity.txt",
          isolatedTarget: declared,
          productionIdentity: production,
          restoreEnvironment: {
            PATH: process.env.PATH,
            PGUSER: "restore_user",
            PGPASSWORD: "not-a-real-secret",
          },
          inspectTarget: async () => ({ ...declared, [field]: value }),
          spawnProcess: (() => {
            spawnCalls += 1;
            throw new Error("SPAWN_MUST_NOT_RUN");
          }) as never,
        }),
      ).rejects.toThrow(`RESTORE_LIVE_TARGET_MISMATCH:${field}`);
      expect(spawnCalls).toBe(0);
    }
    expect(() => assertLiveIsolatedTarget(declared, declared)).not.toThrow();
  });
});
