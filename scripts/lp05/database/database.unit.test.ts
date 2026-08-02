import { describe, expect, it } from "vitest";

import {
  createProductionResourceIdentity,
  verifyProductionUnchanged,
} from "./production-identity.js";
import { planRetention, type RetentionCandidate } from "./retention.js";
import { assertIsolatedTarget } from "./restore-evidence.js";
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
  const production = createProductionResourceIdentity({
    targetId: "target_prod",
    composeProject: "idea-validation-prod",
    database: {
      systemIdentifier: "100",
      volumeLabelSha256: "a".repeat(64),
      containerLabelSha256: "b".repeat(64),
    },
    app: {},
    caddy: {},
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
        },
        production,
      ),
    ).toThrow("RESTORE_TARGET_NOT_ISOLATED");
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
});
