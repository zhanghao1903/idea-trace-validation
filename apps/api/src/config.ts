export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  aiApiToken: string;
  humanControlToken: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  dbPoolMax: number;
  dbConnectTimeoutMs: number;
  shutdownGraceMs: number;
}

export class ConfigError extends Error {
  constructor(readonly field: string) {
    super(`Invalid or missing configuration field: ${field}`);
    this.name = "ConfigError";
  }
}

const enumValue = <T extends string>(
  field: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T => {
  const candidate = value ?? fallback;
  if (!allowed.includes(candidate as T)) throw new ConfigError(field);
  return candidate as T;
};

const integer = (
  field: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new ConfigError(field);
  }
  return candidate;
};

const required = (field: string, value: string | undefined): string => {
  if (value === undefined || value.trim() === "") throw new ConfigError(field);
  return value.trim();
};

export const loadConfig = (environment: NodeJS.ProcessEnv): AppConfig => {
  const databaseUrl = required("DATABASE_URL", environment.DATABASE_URL);
  try {
    const parsed = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol))
      throw new Error("protocol");
  } catch {
    throw new ConfigError("DATABASE_URL");
  }
  const aiApiToken = required("AI_API_TOKEN", environment.AI_API_TOKEN);
  if (aiApiToken.length < 32) throw new ConfigError("AI_API_TOKEN");
  const humanControlToken = required(
    "HUMAN_CONTROL_TOKEN",
    environment.HUMAN_CONTROL_TOKEN,
  );
  const decodedHumanControlToken = Buffer.from(humanControlToken, "base64url");
  if (
    !/^[A-Za-z0-9_-]{43}$/u.test(humanControlToken) ||
    decodedHumanControlToken.length !== 32 ||
    decodedHumanControlToken.toString("base64url") !== humanControlToken ||
    humanControlToken === aiApiToken
  ) {
    throw new ConfigError("HUMAN_CONTROL_TOKEN");
  }
  const host = (environment.HOST ?? "127.0.0.1").trim();
  if (host === "" || host.length > 253 || /[/\s]/u.test(host))
    throw new ConfigError("HOST");

  return {
    nodeEnv: enumValue(
      "NODE_ENV",
      environment.NODE_ENV,
      ["development", "test", "production"],
      "development",
    ),
    host,
    port: integer("PORT", environment.PORT, 3000, 1, 65_535),
    databaseUrl,
    aiApiToken,
    humanControlToken,
    logLevel: enumValue(
      "LOG_LEVEL",
      environment.LOG_LEVEL,
      ["fatal", "error", "warn", "info", "debug", "trace", "silent"],
      "info",
    ),
    dbPoolMax: integer("DB_POOL_MAX", environment.DB_POOL_MAX, 10, 1, 20),
    dbConnectTimeoutMs: integer(
      "DB_CONNECT_TIMEOUT_MS",
      environment.DB_CONNECT_TIMEOUT_MS,
      2_000,
      100,
      10_000,
    ),
    shutdownGraceMs: integer(
      "SHUTDOWN_GRACE_MS",
      environment.SHUTDOWN_GRACE_MS,
      10_000,
      1_000,
      30_000,
    ),
  };
};
