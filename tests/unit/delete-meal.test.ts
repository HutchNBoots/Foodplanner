import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Integration test (real PGlite DB, mocked generation) for the "delete this
// meal" backlog feature (see DECISIONS.md) - proves a delete removes the
// meal row, re-aggregates the week's shopping list to drop its unique
// ingredients, and rejects a batch-cook source meal rather than silently
// stranding the leftover meals that reference it.
const dataDir = mkdtempSync(path.join(tmpdir(), "foodplanner-pglite-delete-"));
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

describe("delete this meal (mocked)", () => {
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

  it("rejects deleting a batch-cook meal that other days rely on as leftovers", async () => {
    // Monday's adult dinner ("Batch-cooked chicken tray bake") is the mock's
    // fixed batch-cook example - see src/lib/claude/mock.ts.
    const detail = await queries.getWeekDetail(weekId);
    const batchMeal = detail?.meals.find((m) => m.batchMakes);
    expect(batchMeal).toBeDefined();

    await expect(generateAndPersist.deleteMealInPlace(batchMeal!.id)).rejects.toThrow(
      generateAndPersist.DeleteNotAllowedError,
    );

    // Still there afterwards - the rejected call didn't delete it anyway.
    const stillThere = await queries.getMeal(batchMeal!.id);
    expect(stillThere).toBeTruthy();
  });

  it("removes a non-batch-cook meal and re-aggregates the shopping list to drop its contribution", async () => {
    const before = await queries.getWeekDetail(weekId);
    // The mock plan's non-batch adult dinners ("Test dinner N") repeat the
    // same "chicken breast" ingredient as the Monday batch-cook meal (see
    // src/lib/claude/mock.ts), so deleting one doesn't remove "chicken
    // breast" from the list entirely - it reduces the aggregated quantity
    // and drops this meal from that item's `usedIn`, which is what this test
    // checks instead (a more accurate proof re-aggregation ran, for this
    // particular mock data).
    const target = before?.meals.find((m) => !m.batchMakes && m.track === "adult" && m.title !== "Batch-cooked chicken tray bake");
    expect(target).toBeDefined();
    const targetChicken = target!.ingredientsJson.find((ing) => ing.name === "chicken breast");
    expect(targetChicken).toBeDefined();

    const beforeItem = before?.shoppingItems.find((i) => i.productName === "chicken breast");
    expect(beforeItem).toBeDefined();
    expect(beforeItem!.usedInJson.some((u) => u.mealId === target!.id)).toBe(true);

    await generateAndPersist.deleteMealInPlace(target!.id);

    const deleted = await queries.getMeal(target!.id);
    expect(deleted).toBeNull();

    const after = await queries.getWeekDetail(weekId);
    expect(after?.meals.find((m) => m.id === target!.id)).toBeUndefined();

    const afterItem = after?.shoppingItems.find((i) => i.productName === "chicken breast");
    expect(afterItem).toBeDefined();
    expect(afterItem!.quantity).toBe((beforeItem!.quantity ?? 0) - (targetChicken!.quantity ?? 0));
    expect(afterItem!.usedInJson.some((u) => u.mealId === target!.id)).toBe(false);
  });
});
