import { describe, expect, it } from "vitest";

import { parseDockerSaveConfigId } from "./loaded-image.js";

describe("LP-05 loaded image identity", () => {
  it("reads the OCI config digest from Docker's portable save manifest", () => {
    const digest = "a".repeat(64);
    expect(
      parseDockerSaveConfigId(
        JSON.stringify([
          {
            Config: `blobs/sha256/${digest}`,
            RepoTags: ["idea-trace-validation:test"],
          },
        ]),
      ),
    ).toBe(`sha256:${digest}`);
  });

  it("rejects ambiguous or legacy config paths", () => {
    expect(() => parseDockerSaveConfigId("[]")).toThrow(
      "LOADED_IMAGE_MANIFEST_INVALID",
    );
    expect(() =>
      parseDockerSaveConfigId(JSON.stringify([{ Config: "config.json" }])),
    ).toThrow("LOADED_IMAGE_CONFIG_INVALID");
  });
});
