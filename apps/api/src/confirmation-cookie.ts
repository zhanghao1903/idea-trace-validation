const COOKIE_NAME = "lp02_confirmation";

export const confirmationCookie = (input: {
  confirmationId: string;
  capability: string;
  expiresAt: string;
}): string => {
  const maxAge = Math.max(
    0,
    Math.floor((Date.parse(input.expiresAt) - Date.now()) / 1000),
  );
  return [
    `${COOKIE_NAME}=${encodeURIComponent(input.capability)}`,
    `Path=/api/v1/human-confirmations/${input.confirmationId}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
};

export const readConfirmationCapability = (
  cookieHeader: string | undefined,
): string => {
  if (cookieHeader === undefined) return "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
};
