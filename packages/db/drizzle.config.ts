import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://idea_validation:idea_validation@127.0.0.1:54329/idea_validation",
  },
  strict: true,
  verbose: true,
});
