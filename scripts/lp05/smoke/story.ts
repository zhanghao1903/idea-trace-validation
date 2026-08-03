import { canonicalJson, sha256 } from "../shared/canonical-json.js";
import { record, type JsonRecord } from "../shared/contracts.js";

export const syntheticStoryProjection = (value: unknown): JsonRecord => {
  const journey = record(value, "SMOKE_JOURNEY_RECORD");
  const refs = record(journey.resourceRefs, "SMOKE_JOURNEY_REFS");
  if (!Array.isArray(journey.assertions) || journey.result !== "PASS")
    throw new Error("SMOKE_JOURNEY_RESULT");
  return {
    resourceRefs: Object.fromEntries(
      Object.entries(refs).sort(([left], [right]) => left.localeCompare(right)),
    ),
    assertions: journey.assertions,
    result: journey.result,
  };
};

export const syntheticStorySha256 = (value: unknown): string =>
  sha256(canonicalJson(syntheticStoryProjection(value)));

export const syntheticResourceIdsSha256 = (value: unknown): string => {
  const refs = record(
    syntheticStoryProjection(value).resourceRefs,
    "SMOKE_JOURNEY_REFS",
  );
  return sha256(
    canonicalJson(
      Object.values(refs)
        .filter((entry): entry is string => typeof entry === "string")
        .sort(),
    ),
  );
};
