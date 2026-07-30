import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migrateNeonHttp } from "drizzle-orm/neon-http/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const migrationsFolder = "./src/db/migrations";

  if (databaseUrl) {
    console.log("Running migrations against Vercel Postgres (Neon) DATABASE_URL...");
    const db = drizzleNeonHttp(neon(databaseUrl));
    await migrateNeonHttp(db, { migrationsFolder });
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
