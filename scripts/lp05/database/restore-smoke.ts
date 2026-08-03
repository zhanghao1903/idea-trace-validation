import { sha256 } from "../shared/canonical-json.js";
import type { JsonRecord } from "../shared/contracts.js";

export const verifyRestoredStory = (input: {
  expectedStorySha256: string;
  expectedResourceIdsSha256: string;
  expectedAssertionSetSha256: string;
  publicReads: JsonRecord;
  assertionSetSha256: string;
}): JsonRecord => {
  const storySha = sha256(JSON.stringify(input.publicReads));
  if (
    storySha !== input.expectedStorySha256 ||
    input.assertionSetSha256 !== input.expectedAssertionSetSha256
  ) {
    throw new Error("RESTORED_STORY_MISMATCH");
  }
  const ids = Object.values(input.publicReads)
    .filter((value): value is string => typeof value === "string")
    .sort();
  if (sha256(JSON.stringify(ids)) !== input.expectedResourceIdsSha256)
    throw new Error("RESTORED_RESOURCE_IDS_MISMATCH");
  return {
    syntheticStorySha256: storySha,
    resourceIdsSha256: input.expectedResourceIdsSha256,
    assertionSetSha256: input.assertionSetSha256,
    status: "PASS",
  };
};
