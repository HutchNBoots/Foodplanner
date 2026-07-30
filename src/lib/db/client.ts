import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

// Production: Railway Postgres over `pg` (see DECISIONS.md for the public-vs
// -private Railway URL note). Local dev/tests: an embedded PGlite instance -
// zero network, zero external service, same schema/dialect either way.
const databaseUrl = process.env.DATABASE_URL;

export const db = databaseUrl
  ? drizzleNodePg(new Pool({ connectionString: databaseUrl, max: 5 }), { schema })
  : drizzlePglite(new PGlite(process.env.PGLITE_DATA_DIR ?? "./local-pgdata"), { schema });
