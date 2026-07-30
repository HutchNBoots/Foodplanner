import type { Config } from "drizzle-kit";

// `drizzle-kit generate` only diffs the schema to produce SQL migration
// files - it doesn't need to connect. Applying migrations (locally or
// against a remote Turso DB) is done by our own `src/lib/db/migrate.ts`
// script via @libsql/client, which does support an auth token.
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./local.db",
  },
} satisfies Config;
