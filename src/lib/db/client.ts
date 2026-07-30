import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

// Production: Railway Postgres over `pg` (see DECISIONS.md for the public-vs
// -private Railway URL note). Local dev/tests: an embedded PGlite instance -
// zero network, zero external service, same schema/dialect either way.
function buildDb() {
  const databaseUrl = process.env.DATABASE_URL;
  return databaseUrl
    ? drizzleNodePg(new Pool({ connectionString: databaseUrl, max: 5 }), { schema })
    : drizzlePglite(new PGlite(process.env.PGLITE_DATA_DIR ?? "./local-pgdata"), { schema });
}

// Next.js compiles each route handler/page into its own server bundle chunk,
// which can re-evaluate this module more than once *within the same process*
// - a plain module-level singleton isn't actually one instance in practice.
// That's fatal for PGlite specifically: two separate embedded-Postgres
// instances pointed at the same directory don't see each other's writes, so
// a week created by POST /api/generate could 404 on the very next GET. A
// `globalThis`-cached singleton (the same pattern used for Prisma clients in
// Next.js) guarantees exactly one instance per process regardless of how
// many bundle chunks import this file.
const globalForDb = globalThis as unknown as { __foodplannerDb?: ReturnType<typeof buildDb> };

export const db = globalForDb.__foodplannerDb ?? (globalForDb.__foodplannerDb = buildDb());
