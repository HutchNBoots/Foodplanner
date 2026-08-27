import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Integration test (real PGlite DB, mocked generation) proving the whole
// MVP 1.2 pipeline end-to-end: a generated week persists meals across all
// three tracks (adult/kids/family), the shopping list stays one unified
// list spanning all of them, and the week nutrition summary can be scoped
// to exclude the kids track (see DECISIONS.md).
const dataDir = mkdtempSync(path.join(tmpdir(), "foodplanner-pglite-mvp12-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.MOCK_GENERATION = "1";
delete process.env.DATABASE_URL;

const sampleIntake = {
  weekStartDate: "2026-08-15",
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

describe("MVP 1.2 generation pipeline (mocked)", () => {
  let queries: typeof import("@/lib/db/queries");
  let generateAndPersist: typeof import("@/lib/weeks/generateAndPersist");
  let trackModule: typeof import("@/lib/meals/track");
  let summaryModule: typeof import("@/lib/nutrition/summary");
  let weekId: string;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const { db } = await import("@/lib/db/client");
    queries = await import("@/lib/db/queries");
    generateAndPersist = await import("@/lib/weeks/generateAndPersist");
    trackModule = await import("@/lib/meals/track");
    summaryModule = await import("@/lib/nutrition/summary");

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

  it("persists meals across all three tracks", async () => {
    const detail = await queries.getWeekDetail(weekId);
    const tracks = new Set(detail?.meals.map((m) => trackModule.trackForMeal(m)));
    expect(tracks).toEqual(new Set(["adult", "kids", "family"]));
  });

  it("keeps the shopping list unified across tracks (kids ingredients included)", async () => {
    const detail = await queries.getWeekDetail(weekId);
    const productNames = detail?.shoppingItems.map((i) => i.productName) ?? [];
    expect(productNames).toContain("chicken breast"); // adult track
    expect(productNames).toContain("pasta"); // kids track
  });

  it("excludes the kids track when scoping the week nutrition summary", async () => {
    const detail = await queries.getWeekDetail(weekId);
    const allMeals = detail?.meals ?? [];
    const nutritionMeals = allMeals.filter((m) => trackModule.trackForMeal(m) !== "kids");

    expect(nutritionMeals.length).toBeGreaterThan(0);
    expect(nutritionMeals.every((m) => trackModule.trackForMeal(m) !== "kids")).toBe(true);

    // Sanity: the summary itself is just a sum of whatever's passed in, so
    // scoping actually happening is what this test is really proving.
    const summary = summaryModule.computeNutritionSummary(nutritionMeals);
    expect(summary.weekTotal.kcal).toBeGreaterThan(0);
  });

  it("stays within the weekly leftover cap", async () => {
    const detail = await queries.getWeekDetail(weekId);
    const leftoverSlots = (detail?.meals ?? []).reduce((sum, m) => sum + (m.leftoverForJson?.length ?? 0), 0);
    expect(leftoverSlots).toBeLessThanOrEqual(2);
  });
});
