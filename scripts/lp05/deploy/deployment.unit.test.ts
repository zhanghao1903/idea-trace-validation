import { describe, expect, it } from "vitest";

import { loadDeploymentConfig } from "./config.js";
import { evaluateOperations } from "./ops-status.js";
import { parseSemver, inspectToolchain } from "./toolchain.js";
import { verifyPublishedPorts } from "../smoke/network.js";

const environment = (): NodeJS.ProcessEnv => ({
  DEPLOY_DOMAIN: "demo.example.com",
  ACME_EMAIL: "operator@example.com",
  RELEASE_ID: "lp05-aaaaaaaaaaaa-amd64",
  SOURCE_COMMIT: "a".repeat(40),
  SOURCE_TREE: "b".repeat(40),
  APP_IMAGE_ID: `sha256:${"c".repeat(64)}`,
  APP_IMAGE: "idea-trace-validation:lp05-aaaaaaaaaaaa-amd64",
  APP_PLATFORM: "linux/amd64",
  POSTGRES_USER: "idea_validation",
  POSTGRES_DB: "idea_validation",
  DEPLOY_ROOT: "/srv/idea-validation",
  BACKUP_ROOT: "/srv/idea-validation-backups",
  SECRETS_ROOT: "/etc/idea-validation/secrets",
});

describe("LP-05 deployment config", () => {
  it("accepts distinct safe roots and an exact candidate identity", () => {
    expect(loadDeploymentConfig(environment()).composeProject).toBe(
      "idea-validation-prod",
    );
  });

  it("rejects latest images and root collisions", () => {
    expect(() =>
      loadDeploymentConfig({
        ...environment(),
        APP_IMAGE: "idea-trace-validation:latest",
      }),
    ).toThrow("CONFIG_INVALID:APP_IMAGE");
    expect(() =>
      loadDeploymentConfig({
        ...environment(),
        BACKUP_ROOT: "/srv/idea-validation",
      }),
    ).toThrow("CONFIG_ROOTS_MUST_DIFFER");
  });
});

describe("LP-05 toolchain preflight", () => {
  it("parses official version output", () =>
    expect(parseSemver("Docker version 28.2.1", "NO")).toEqual([28, 2, 1]));

  it("accepts the approved ranges and sources", async () => {
    const output = await inspectToolchain({
      platform: "linux",
      dockerInstallationSource: "OFFICIAL_DOCKER_PACKAGE",
      ageInstallationSource: "OS_VENDOR_PACKAGE",
      now: new Date("2026-08-03T00:00:00.000Z"),
      run: async (command, args) =>
        command === "age"
          ? "v1.2.1"
          : args.includes("compose")
            ? "2.35.0"
            : "28.2.1",
    });
    expect(output.composeVersion).toBe("2.35.0");
  });

  it("fails closed on host OS, Compose major and unknown source", async () => {
    await expect(inspectToolchain({ platform: "darwin" })).rejects.toThrow(
      "TOOLCHAIN_UNSUPPORTED:HOST_OS",
    );
    await expect(
      inspectToolchain({
        platform: "linux",
        dockerInstallationSource: "OFFICIAL_DOCKER_PACKAGE",
        ageInstallationSource: "OS_VENDOR_PACKAGE",
        run: async (command, args) =>
          command === "age"
            ? "1.2.1"
            : args.includes("compose")
              ? "5.1.1"
              : "28.2.1",
      }),
    ).rejects.toThrow("TOOLCHAIN_UNSUPPORTED:COMPOSE_RANGE");
  });
});

describe("LP-05 operational safety", () => {
  it("publishes only Caddy and restricts local ports to loopback", () => {
    verifyPublishedPorts(
      [
        {
          service: "caddy",
          hostIp: "127.0.0.1",
          published: 18080,
          target: 8080,
        },
        {
          service: "caddy",
          hostIp: "127.0.0.1",
          published: 18443,
          target: 8443,
        },
      ],
      "LOCAL",
    );
    expect(() =>
      verifyPublishedPorts(
        [
          {
            service: "postgres",
            hostIp: "0.0.0.0",
            published: 5432,
            target: 5432,
          },
        ],
        "EXTERNAL",
      ),
    ).toThrow("NETWORK_EXPOSURE");
  });

  it("emits stable operations reason codes", () => {
    expect(
      evaluateOperations({
        appHealthy: false,
        databaseHealthy: true,
        restartCount: 4,
        certificateDaysRemaining: 10,
        freeBytes: 10,
        minimumFreeBytes: 20,
        newestBackupAgeHours: 40,
        backupTimerPassed: false,
        lastSmokePassed: false,
        observedAt: "2026-08-03T00:00:00.000Z",
      }).reasonCodes,
    ).toEqual([
      "APP_UNHEALTHY",
      "RESTART_LOOP",
      "CERTIFICATE_EXPIRY_RISK",
      "DISK_SPACE_LOW",
      "BACKUP_STALE",
      "BACKUP_TIMER_FAILED",
      "SMOKE_FAILED",
    ]);
  });
});
