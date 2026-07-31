import { describe, expect, it } from "vitest";

import {
  canonicalConfirmationJson,
  capabilityHash,
  decodeHumanControlToken,
  deriveConfirmationCapability,
  secureHashEqual,
} from "../src/index.js";

describe("LP-02 confirmation cryptography", () => {
  const token = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  it("normalizes strings to trim + NFC and recursively sorts fixed keys", () => {
    expect(
      canonicalConfirmationJson({
        z: [" e\u0301 ", " second "],
        a: { y: " value ", x: null },
      }),
    ).toBe('{"a":{"x":null,"y":"value"},"z":["é","second"]}');
  });

  it("derives a stable scoped capability without persisting the raw secret", () => {
    const capability = deriveConfirmationCapability({
      secret: token,
      confirmationId: "confirm_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      payloadDigest:
        "c51e5800ec3c3adf76081594e9f7b3fd3d42d93d914cb92903970997dd2a4449",
      expiresAt: new Date("2026-07-31T04:30:00.000Z"),
      idempotencyKey: "confirm-fixture-1",
    });
    expect(capability).toBe("p_LEU0pMJJ-P2n4EJvwkvh8vZSTAnJHSmCWIDgcVtwQ");
    expect(capability).not.toContain(token);
    expect(capabilityHash(capability)).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      secureHashEqual(capabilityHash(capability), capabilityHash(capability)),
    ).toBe(true);
    expect(
      secureHashEqual(
        capabilityHash(capability),
        capabilityHash(`${capability}x`),
      ),
    ).toBe(false);
  });

  it("requires an exact unpadded base64url 32-byte control token", () => {
    expect(decodeHumanControlToken(token)).toHaveLength(32);
    expect(() => decodeHumanControlToken("too-short")).toThrowError(
      "INVALID_HUMAN_CONTROL_TOKEN",
    );
    expect(() =>
      decodeHumanControlToken(`${token.slice(0, -1)}J`),
    ).toThrowError("INVALID_HUMAN_CONTROL_TOKEN");
  });
});
