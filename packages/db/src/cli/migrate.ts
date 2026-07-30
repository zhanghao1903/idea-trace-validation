import { createPool } from "../pool.js";
import { migrate } from "../migrate.js";

const useTestDatabase = process.argv.includes("--test");
const databaseUrl = useTestDatabase
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error(
    useTestDatabase
      ? "TEST_DATABASE_URL is required"
      : "DATABASE_URL is required",
  );
}

const pool = createPool({ databaseUrl, max: 1, connectTimeoutMs: 2_000 });
try {
  const result = await migrate(pool);
  process.stdout.write(
    `${result.id}: ${result.applied ? "applied" : "already applied"}\n`,
  );
} finally {
  await pool.end();
}
