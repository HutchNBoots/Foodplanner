import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Regression test for the MVP1 "silent Failed state" bug (see
// DECISIONS.md's "Retry design"): retrying a failed week should reuse the
// same week row/id (not create a new one, which would also pollute History
// with another same-date row - see the duplicate-date bug test) and should
// end up `ready` using the week's already-stored intake.
const dataDir = mkdtempSync(path.join(tmpdir(), "foodplanner-pglite-retry-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.MOCK_GENERATION = "1";
delete process.env.DATABASE_URL;

const sampleIntake = {
  weekStartDate: "2026-08-10",
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

describe("retrying a failed week", () => {
  let db: (typeof import("@/lib/db/client"))["db"];
  let schema: typeof import("@/lib/db/schema");
  let queries: typeof import("@/lib/db/queries");
  let generateAndPersist: typeof import("@/lib/weeks/generateAndPersist");
  let householdId: string;
  let weekId: string;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    ({ db } = await import("@/lib/db/client"));
    schema = await import("@/lib/db/schema");
    queries = await import("@/lib/db/queries");
    generateAndPersist = await import("@/lib/weeks/generateAndPersist");

    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: "./src/db/migrations" });

    const household = await queries.getOrCreateHousehold();
    householdId = household.id;
  });

  beforeEach(async () => {
    const created = await queries.createWeek(householdId, sampleIntake.weekStartDate, sampleIntake);
    weekId = created.id;
    await queries.setWeekError(weekId, "Claude did not return a tool call.");
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("resets the same week row to generating, then to ready, without creating a new week", async () => {
    const before = await queries.listWeeks(householdId);
    const weekCountBefore = before.length;

    await queries.resetWeekForRetry(weekId);
    const reset = await queries.getWeekById(weekId);
    expect(reset?.status).toBe("generating");
    expect(reset?.errorMessage).toBeNull();

    const household = await queries.getOrCreateHousehold();
    await generateAndPersist.runWeekGeneration({
      weekId,
      household,
      weekStartDate: sampleIntake.weekStartDate,
      intake: sampleIntake,
    });

    const after = await queries.getWeekById(weekId);
    expect(after?.status).toBe("ready");
    expect(after?.id).toBe(weekId);

    const allWeeks = await queries.listWeeks(householdId);
    expect(allWeeks).toHaveLength(weekCountBefore);

    const detail = await queries.getWeekDetail(weekId);
    expect(detail?.meals.length).toBeGreaterThan(0);
  });

  it("clears any meals from a prior partial attempt before regenerating", async () => {
    // Simulate a partially-persisted prior attempt: a meal row exists even
    // though the week is in "error" status.
    await db.insert(schema.meals).values({
      weekId,
      dayDate: "2026-08-10",
      dayOfWeek: "Monday",
      slot: "dinner",
      title: "Stale meal from a failed attempt",
      servingsAdults: 2,
      servingsKids: 0,
      ingredientsJson: [],
      methodJson: ["Step one."],
      kcal: 100,
      proteinG: 10,
      carbsG: 10,
      fatG: 10,
      fibreG: 1,
    });

    await queries.resetWeekForRetry(weekId);

    const detail = await queries.getWeekDetail(weekId);
    expect(detail?.meals.some((m) => m.title === "Stale meal from a failed attempt")).toBe(false);
  });
});
