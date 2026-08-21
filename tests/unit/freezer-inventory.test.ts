import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Integration test (real PGlite DB, mocked generation) for freezer inventory
// tracking (backlog item, see DECISIONS.md): a batch-cook meal's
// freezerPortions stocks the freezer, the household can read it back, and a
// manual removal clears it. The "a later generation consumes it" half can't
// be exercised here - MOCK_GENERATION's mock plan doesn't read freezer
// inventory as an input the way a real Claude call does (see DECISIONS.md
// for why that half is documented, not tested, in this sandbox).
const dataDir = mkdtempSync(path.join(tmpdir(), "foodplanner-pglite-freezer-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.MOCK_GENERATION = "1";
delete process.env.DATABASE_URL;

const sampleIntake = {
  weekStartDate: "2026-08-03",
  daysMode: "full_week" as const,
  familyMeals: { satBreakfast: "sit_down", satEvening: "sit_down", sunLunch: "sit_down" } as const,
  parentMeals: { breakfast: false, lunch: true, dinner: true } as const,
  kidsMeals: { breakfast: true, lunch: true, dinner: true } as const,
  dishStyles: [],
  proteins: [],
  avoidRepeating: [],
  budget: "",
  effort: "mixed" as const,
  notes: "",
  energyDirection: "lose_weight" as const,
  focuses: [],
};

describe("freezer inventory tracking (mocked)", () => {
  let queries: typeof import("@/lib/db/queries");
  let generateAndPersist: typeof import("@/lib/weeks/generateAndPersist");
  let householdId: string;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const { db } = await import("@/lib/db/client");
    queries = await import("@/lib/db/queries");
    generateAndPersist = await import("@/lib/weeks/generateAndPersist");

    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "./src/db/migrations" });

    const household = await queries.getOrCreateHousehold();
    householdId = household.id;
    const created = await queries.createWeek(household.id, sampleIntake.weekStartDate, sampleIntake);

    await generateAndPersist.runWeekGeneration({
      weekId: created.id,
      household,
      weekStartDate: sampleIntake.weekStartDate,
      intake: sampleIntake,
    });
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("stocks the freezer from a batch-cook meal's freezerPortions", async () => {
    // Monday's kids dinner ("Pasta with pesto") is the mock's fixed
    // freezer-batch example (makes 8, freezerPortions 4) - see mock.ts.
    const inventory = await queries.getFreezerInventory(householdId);
    const item = inventory.find((i) => i.itemName === "Pasta with pesto");
    expect(item).toBeDefined();
    expect(item?.portions).toBe(4);
  });

  it("can be found by exact name (how a future generation would match it)", async () => {
    const found = await queries.findFreezerItemByName(householdId, "Pasta with pesto");
    expect(found?.portions).toBe(4);

    const notFound = await queries.findFreezerItemByName(householdId, "Something not in the freezer");
    expect(notFound).toBeNull();
  });

  it("consumeFreezerItem decrements, and deletes the row once portions hit zero", async () => {
    const before = await queries.findFreezerItemByName(householdId, "Pasta with pesto");
    expect(before).not.toBeNull();

    await queries.consumeFreezerItem(before!.id, 2);
    const afterPartial = await queries.findFreezerItemByName(householdId, "Pasta with pesto");
    expect(afterPartial?.portions).toBe(2);

    await queries.consumeFreezerItem(before!.id, 2);
    const afterFull = await queries.findFreezerItemByName(householdId, "Pasta with pesto");
    expect(afterFull).toBeNull();
  });

  it("removeFreezerItem clears a manually-used/binned item", async () => {
    await queries.addFreezerItem(householdId, "Test leftover lasagne", 3, null);
    const added = await queries.findFreezerItemByName(householdId, "Test leftover lasagne");
    expect(added).not.toBeNull();

    await queries.removeFreezerItem(added!.id);
    const afterRemove = await queries.findFreezerItemByName(householdId, "Test leftover lasagne");
    expect(afterRemove).toBeNull();
  });
});
