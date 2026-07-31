import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  decodeCursor,
  encodeCursor,
  requestDigest,
} from "../src/index.js";

describe("idempotency request identity", () => {
  it("sorts object keys while preserving array order", () => {
    expect(canonicalJson({ z: [2, 1], a: { y: true, x: false } })).toBe(
      '{"a":{"x":false,"y":true},"z":[2,1]}',
    );
  });

  it("does not include authorization in the digest inputs", () => {
    const first = requestDigest(
      "post",
      "/api/v1/ideas/:ideaId/promotions",
      {
        ideaId: "idea_01",
      },
      { expectedVersion: 1 },
    );
    const second = requestDigest(
      "POST",
      "/api/v1/ideas/:ideaId/promotions",
      {
        ideaId: "idea_01",
      },
      { expectedVersion: 1 },
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("strictly validates cursor version, timestamp and entity ID", () => {
    const valid = encodeCursor({
      v: 1,
      updatedAt: "2026-07-30T16:00:00.123Z",
      id: "idea_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    });
    expect(decodeCursor(valid, "idea")).toMatchObject({ v: 1 });
    expect(() => decodeCursor(valid, "project")).toThrowError("INVALID_CURSOR");
    expect(() => decodeCursor("not-json", "idea")).toThrowError(
      "INVALID_CURSOR",
    );
  });
});
