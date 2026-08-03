import type { HttpObservation } from "./http.js";

export const APPROVED_CONTENT_SECURITY_POLICY =
  "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'";

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
  if (headers["content-security-policy"] !== APPROVED_CONTENT_SECURITY_POLICY)
    throw new Error("SMOKE_CSP");
  if (dynamic && headers["cache-control"]?.includes("no-store") !== true)
    throw new Error("SMOKE_CACHE");
};

export const verifyHttpsRedirect = (
  observation: HttpObservation,
  expectedDestination: string,
): void => {
  if (![301, 302, 307, 308].includes(observation.status))
    throw new Error("SMOKE_HTTP_REDIRECT");
  const location = observation.headers.location;
  if (location === undefined || location === "")
    throw new Error("SMOKE_HTTP_REDIRECT_LOCATION");
  const expected = new URL(expectedDestination);
  let actual: URL;
  try {
    actual = new URL(location);
  } catch {
    throw new Error("SMOKE_HTTP_REDIRECT_LOCATION");
  }
  if (
    actual.protocol !== "https:" ||
    actual.hostname !== expected.hostname ||
    actual.port !== expected.port ||
    actual.pathname !== expected.pathname ||
    actual.search !== expected.search ||
    actual.hash !== expected.hash ||
    actual.username !== "" ||
    actual.password !== ""
  )
    throw new Error("SMOKE_HTTP_REDIRECT_DESTINATION");
};
