import { DomainError } from "./errors.js";

export const assertEvidenceLocator = (
  kind: "LINK" | "ARTIFACT" | "METRIC" | "NOTE",
  locator?: string,
): void => {
  if (kind === "LINK") {
    try {
      const parsed = new URL(locator ?? "");
      if (
        parsed.protocol !== "https:" ||
        parsed.username !== "" ||
        parsed.password !== ""
      ) {
        throw new Error("unsafe");
      }
    } catch {
      throw new DomainError(
        "VALIDATION_FAILED",
        "LINK Evidence must use a safe HTTPS URL.",
        {
          issues: [
            {
              path: "/locator",
              keyword: "safeHttps",
              message: "must be HTTPS and contain no user-info",
            },
          ],
          recovery: "FIX_REQUEST",
        },
      );
    }
  }
  if (
    kind === "ARTIFACT" &&
    !/^artifact_[0-9A-HJKMNP-TV-Z]{26}$/u.test(locator ?? "")
  ) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "ARTIFACT Evidence needs a controlled artifact ID.",
      {
        issues: [
          {
            path: "/locator",
            keyword: "pattern",
            message: "must be artifact_<ULID>",
          },
        ],
        recovery: "FIX_REQUEST",
      },
    );
  }
};
