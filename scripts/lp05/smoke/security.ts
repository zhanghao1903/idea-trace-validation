import type { HttpObservation } from "./http.js";

export const verifySecurityHeaders = (
  observation: HttpObservation,
  dynamic: boolean,
): void => {
  const headers = observation.headers;
  if (headers["strict-transport-security"]?.includes("max-age=") !== true)
    throw new Error("SMOKE_HSTS");
  if (headers["x-content-type-options"] !== "nosniff")
    throw new Error("SMOKE_NOSNIFF");
  if (headers["x-frame-options"] !== "DENY") throw new Error("SMOKE_FRAME");
  if (headers["referrer-policy"] !== "no-referrer")
    throw new Error("SMOKE_REFERRER");
  if (dynamic && headers["cache-control"]?.includes("no-store") !== true)
    throw new Error("SMOKE_CACHE");
};
