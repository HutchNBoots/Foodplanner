import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Integration test (real PGlite DB, not just the pure matcher) proving the
// canonical ingredients table actually collapses near-duplicates across
// generations, per the MVP 1.1 DoD requirement: "test coverage proving
// near-duplicates (e.g. 'cherry tomato' vs. 'cherry tomatoes') collapse to
// one entry."
const dataDir = mkdtempSync(path.join(tmpdir(), "foodplanner-pglite-ingredients-"));
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;

describe("resolveCanonicalIngredients against a real table", () => {
  let db: (typeof import("@/lib/db/client"))["db"];
  let schema: typeof import("@/lib/db/schema");
  let resolveModule: typeof import("@/lib/ingredients/resolve");

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    ({ db } = await import("@/lib/db/client"));
    schema = await import("@/lib/db/schema");
    resolveModule = await import("@/lib/ingredients/resolve");
    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "./src/db/migrations" });
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("creates one canonical row for a name never seen before", async () => {
    const resolved = await resolveModule.resolveCanonicalIngredients([
      { name: "chicken breast", aisle: "Meat & fish" },
    ]);
    expect(resolved.get("chicken breast")?.name).toBe("chicken breast");

    const rows = await db.select().from(schema.ingredientsCanonical);
    expect(rows).toHaveLength(1);
  });

  it("matches a near-duplicate within the same batch to a single new row, not two", async () => {
    const resolved = await resolveModule.resolveCanonicalIngredients([
      { name: "cherry tomato", aisle: "Fresh produce" },
      { name: "cherry tomatoes", aisle: "Fresh produce" },
    ]);

    expect(resolved.get("cherry tomato")?.canonicalIngredientId).toBe(
      resolved.get("cherry tomatoes")?.canonicalIngredientId,
    );

    const rows = await db.select().from(schema.ingredientsCanonical);
    const cherryRows = rows.filter((r) => r.name.toLowerCase().includes("cherry"));
    expect(cherryRows).toHaveLength(1);
  });

  it("matches a later generation's near-duplicate against the existing canonical row", async () => {
    // "chicken breast" was already created above - a later week's "Chicken Breasts"
    // should reuse that same canonical row rather than creating a second one.
    const resolved = await resolveModule.resolveCanonicalIngredients([
      { name: "Chicken Breasts", aisle: "Meat & fish" },
    ]);

    const rows = await db.select().from(schema.ingredientsCanonical);
    const chickenRows = rows.filter((r) => r.name.toLowerCase().includes("chicken"));
    expect(chickenRows).toHaveLength(1);
    expect(resolved.get("Chicken Breasts")?.name).toBe(chickenRows[0]?.name);
  });

  it("keeps genuinely different ingredients as separate canonical rows", async () => {
    await resolveModule.resolveCanonicalIngredients([
      { name: "chicken thigh", aisle: "Meat & fish" },
      { name: "olive oil", aisle: "Store cupboard" },
      { name: "sesame oil", aisle: "Store cupboard" },
    ]);

    const rows = await db.select().from(schema.ingredientsCanonical);
    const names = rows.map((r) => r.name.toLowerCase());
    expect(names).toContain("chicken thigh");
    expect(names).toContain("olive oil");
    expect(names).toContain("sesame oil");
  });
});
