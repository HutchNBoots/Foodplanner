import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Integration test (real PGlite DB, mocked generation) for the "swap this
// meal" backlog feature (see DECISIONS.md) - proves a swap replaces one
// meal's content in place, re-aggregates the week's shopping list, and
// rejects a batch-cook source meal rather than silently stranding the
// leftover meals that reference it.
const dataDir = mkdtempSync(path.join(tmpdir(), "foodplanner-pglite-swap-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.MOCK_GENERATION = "1";
delete process.env.DATABASE_URL;

const sampleIntake = {
  // A Monday (unlike the other integration tests' "2026-08-15", a Saturday)
  // so day-index-0's adult dinner isn't covered by the Saturday-evening
  // family occasion instead - this test needs a real batch-cook meal to
  // exist (see src/lib/claude/mock.ts's `i === 0` batchCook example).
  weekStartDate: "2026-08-03",
  numDays: 7,
  deliveryTime: "",
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

describe("swap this meal (mocked)", () => {
  let queries: typeof import("@/lib/db/queries");
  let generateAndPersist: typeof import("@/lib/weeks/generateAndPersist");
  let weekId: string;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const { db } = await import("@/lib/db/client");
    queries = await import("@/lib/db/queries");
    generateAndPersist = await import("@/lib/weeks/generateAndPersist");

    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "./src/db/migrations" });

    const household = await queries.getOrCreateHousehold();
    const created = await queries.createWeek(household.id, sampleIntake.weekStartDate, sampleIntake);
    weekId = created.id;

    await generateAndPersist.runWeekGeneration({
      weekId,
      household,
      weekStartDate: sampleIntake.weekStartDate,
      intake: sampleIntake,
    });
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("rejects swapping a batch-cook meal that other days rely on as leftovers", async () => {
    // Monday's adult dinner ("Batch-cooked chicken tray bake") is the mock's
    // fixed batch-cook example - see src/lib/claude/mock.ts.
    const detail = await queries.getWeekDetail(weekId);
    const batchMeal = detail?.meals.find((m) => m.batchMakes);
    expect(batchMeal).toBeDefined();

    await expect(generateAndPersist.swapMealInPlace(batchMeal!.id)).rejects.toThrow(
      generateAndPersist.SwapNotAllowedError,
    );
  });

  it("replaces a non-batch-cook meal's content in place and keeps its slot/track/servings", async () => {
    const detail = await queries.getWeekDetail(weekId);
    const target = detail?.meals.find((m) => !m.batchMakes && m.track === "adult");
    expect(target).toBeDefined();

    await generateAndPersist.swapMealInPlace(target!.id);

    const updated = await queries.getMeal(target!.id);
    expect(updated?.title).toBe("Swapped-in lemon herb salmon");
    expect(updated?.slot).toBe(target!.slot);
    expect(updated?.track).toBe(target!.track);
    expect(updated?.servingsAdults).toBe(target!.servingsAdults);
    expect(updated?.servingsKids).toBe(target!.servingsKids);
    expect(updated?.batchMakes).toBeNull();
  });

  it("re-aggregates the shopping list to include the swapped-in meal's ingredients", async () => {
    const detail = await queries.getWeekDetail(weekId);
    const productNames = detail?.shoppingItems.map((i) => i.productName) ?? [];
    expect(productNames).toContain("salmon fillet");
  });
});
