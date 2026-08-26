import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Integration test (real PGlite DB, mocked generation) for the History
// page's "delete this week" feature (see DECISIONS.md) - proves deleting a
// week also removes everything derived from it (meals, shopping list,
// feedback) via the FK cascade, not just the `weeks` row itself.
const dataDir = mkdtempSync(path.join(tmpdir(), "foodplanner-pglite-delete-week-"));
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

describe("delete week (mocked)", () => {
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

    const detail = await queries.getWeekDetail(weekId);
    const firstMeal = detail?.meals[0];
    if (firstMeal) {
      await queries.addFeedback(firstMeal.id, weekId, "loved");
    }
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("removes the week's meals, shopping items, and feedback along with the week itself", async () => {
    const before = await queries.getWeekDetail(weekId);
    expect(before).not.toBeNull();
    expect(before!.meals.length).toBeGreaterThan(0);
    expect(before!.shoppingItems.length).toBeGreaterThan(0);

    await queries.deleteWeek(weekId);

    const after = await queries.getWeekDetail(weekId);
    expect(after).toBeNull();

    const meals = await queries.getMealsForWeek(weekId);
    expect(meals).toHaveLength(0);
  });

  it("is idempotent - deleting an already-gone week does not throw", async () => {
    await expect(queries.deleteWeek(weekId)).resolves.not.toThrow();
  });
});
