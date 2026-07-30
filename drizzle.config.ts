import type { Config } from "drizzle-kit";

// `drizzle-kit generate` only diffs the schema to produce SQL migration
// files - it doesn't need a live connection, so a placeholder URL is fine
// when developing without a real Postgres instance. Applying migrations
// (locally against PGlite, or against Vercel Postgres/Neon) is done by our
// own `src/lib/db/migrate.ts` script - see DECISIONS.md.
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/foodplanner",
  },
} satisfies Config;
