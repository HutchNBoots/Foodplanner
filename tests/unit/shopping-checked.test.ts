import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// MVP 1.1 "must-ship" CX item: ticking off shopping items must persist
// server-side (not just client state), so it survives a phone/laptop switch
// mid-shop - see DECISIONS.md.
const dataDir = mkdtempSync(path.join(tmpdir(), "foodplanner-pglite-shopping-"));
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;

describe("setShoppingItemChecked", () => {
  let db: (typeof import("@/lib/db/client"))["db"];
  let schema: typeof import("@/lib/db/schema");
  let queries: typeof import("@/lib/db/queries");
  let itemId: string;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    ({ db } = await import("@/lib/db/client"));
    schema = await import("@/lib/db/schema");
    queries = await import("@/lib/db/queries");
    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "./src/db/migrations" });

    const household = await queries.getOrCreateHousehold();
    const week = await queries.createWeek(household.id, "2026-08-10", {
      daysMode: "full_week",
      sundayMode: "sit_down",
      dishStyles: [],
      proteins: [],
      avoidRepeating: [],
      budget: "",
      effort: "mixed",
      notes: "",
    });

    const [item] = await db
      .insert(schema.shoppingItems)
      .values({
        weekId: week.id,
        productName: "chicken breast",
        quantity: 700,
        unit: "g",
        displayQuantity: "700g",
        aisle: "Meat & fish",
        usedInJson: [],
      })
      .returning();
    itemId = item!.id;
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("defaults to unchecked", async () => {
    const rows = await db.select().from(schema.shoppingItems);
    const found = rows.find((r) => r.id === itemId);
    expect(found?.checked).toBe(false);
  });

  it("persists a toggle to checked and back", async () => {
    const checked = await queries.setShoppingItemChecked(itemId, true);
    expect(checked?.checked).toBe(true);

    const unchecked = await queries.setShoppingItemChecked(itemId, false);
    expect(unchecked?.checked).toBe(false);
  });

  it("returns null for an unknown item id", async () => {
    const result = await queries.setShoppingItemChecked("00000000-0000-0000-0000-000000000000", true);
    expect(result).toBeNull();
  });
});
