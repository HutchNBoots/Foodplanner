import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const migrationsFolder = "./src/db/migrations";

  if (databaseUrl) {
    console.log("Running migrations against Railway/Postgres DATABASE_URL...");
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzleNodePg(pool);
    await migrateNodePg(db, { migrationsFolder });
    await pool.end();
  } else {
    const dataDir = process.env.PGLITE_DATA_DIR ?? "./local-pgdata";
    console.log(`Running migrations against local PGlite (${dataDir})...`);
    const client = new PGlite(dataDir);
    const db = drizzlePglite(client);
    await migratePglite(db, { migrationsFolder });
    await client.close();
  }

  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
