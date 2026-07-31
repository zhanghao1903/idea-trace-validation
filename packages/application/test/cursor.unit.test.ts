import { describe, expect, it } from "vitest";

import { decodeHistoryCursor, encodeHistoryCursor } from "../src/index.js";

describe("LP-02 history cursors", () => {
  it("allows the LP-01 promotion audit at project history version one", () => {
    const cursor = encodeHistoryCursor({
      v: 1,
      resultingProjectVersion: 1,
      id: "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    });
    expect(decodeHistoryCursor(cursor, "projectHistory")).toEqual({
      v: 1,
      resultingProjectVersion: 1,
      id: "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    });
    expect(() => decodeHistoryCursor(cursor, "progress")).toThrowError(
      "INVALID_CURSOR",
    );
  });

  it("rejects a cursor whose ID does not belong to the selected collection", () => {
    const cursor = encodeHistoryCursor({
      v: 1,
      resultingProjectVersion: 2,
      id: "evd_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    });
    expect(() => decodeHistoryCursor(cursor, "attention")).toThrowError(
      "INVALID_CURSOR",
    );
  });
});
