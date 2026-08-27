import { describe, expect, it } from "vitest";
import { weekPlanSchema, weekPlanToolInputSchema } from "@/lib/claude/schema";
import { buildMockWeekPlan } from "@/lib/claude/mock";
import type { FamilyMeals, MealTimesNeeded } from "@/lib/db/schema";

const allSitDown: FamilyMeals = { satBreakfast: "sit_down", satEvening: "sit_down", sunLunch: "sit_down" };
const parentMeals: MealTimesNeeded = { breakfast: false, lunch: true, dinner: true };
const kidsMeals: MealTimesNeeded = { breakfast: true, lunch: true, dinner: true };

const validPlan = {
  summary: "A varied week of high-protein meals.",
  days: [
    {
      day: "Monday",
      date: "2026-08-03",
      meals: [
        {
          slot: "dinner",
          track: "adult",
          title: "Chicken tray bake",
          servingsAdults: 2,
          servingsKids: 0,
          ingredients: [{ name: "chicken breast", quantity: 400, unit: "g", aisle: "Meat & fish", cholesterolLowering: false, lowSaturatedFat: false }],
          method: ["Preheat the oven.", "Roast for 25 minutes."],
          macrosPerAdultPortion: { kcal: 520, proteinG: 38, carbsG: 40, fatG: 18, fibreG: 8 },
          photoQuery: "chicken tray bake",
          usesFreezerItem: null,
          batchCook: null,
        },
      ],
    },
  ],
};

describe("weekPlanSchema", () => {
  it("accepts a well-formed plan matching what the tool call should return", () => {
    const result = weekPlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it("rejects a plan missing required macro fields", () => {
    const broken = structuredClone(validPlan);
    // @ts-expect-error - deliberately malformed for the test
    delete broken.days[0].meals[0].macrosPerAdultPortion.proteinG;

    const result = weekPlanSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("rejects an ingredient with an aisle outside the allowed list", () => {
    const broken = structuredClone(validPlan);
    broken.days[0]!.meals[0]!.ingredients[0]!.aisle = "Not a real aisle";

    const result = weekPlanSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("rejects a day with no meals", () => {
    const broken = structuredClone(validPlan);
    broken.days[0]!.meals = [];

    const result = weekPlanSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("derives a tool input_schema with the expected top-level shape", () => {
    const schema = weekPlanToolInputSchema();
    expect(schema.type).toBe("object");
    expect(schema).not.toHaveProperty("$schema");
    expect(schema.properties).toHaveProperty("days");
    expect(schema.properties).toHaveProperty("summary");
  });
});

describe("buildMockWeekPlan", () => {
  it("produces output that validates against weekPlanSchema for every numDays", () => {
    for (const numDays of [1, 5, 6, 7, 14]) {
      const plan = buildMockWeekPlan({ weekStartDate: "2026-08-03", numDays, familyMeals: allSitDown, parentMeals, kidsMeals });
      const result = weekPlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    }
  });

  it("produces exactly numDays days", () => {
    expect(
      buildMockWeekPlan({ weekStartDate: "2026-08-03", numDays: 7, familyMeals: allSitDown, parentMeals, kidsMeals })
        .days,
    ).toHaveLength(7);
    expect(
      buildMockWeekPlan({ weekStartDate: "2026-08-03", numDays: 5, familyMeals: allSitDown, parentMeals, kidsMeals })
        .days,
    ).toHaveLength(5);
    expect(
      buildMockWeekPlan({ weekStartDate: "2026-08-03", numDays: 14, familyMeals: allSitDown, parentMeals, kidsMeals })
        .days,
    ).toHaveLength(14);
  });

  it("skips the kids track entirely when all three kids meal-times are toggled off", () => {
    const plan = buildMockWeekPlan({
      weekStartDate: "2026-08-03",
      numDays: 7,
      familyMeals: allSitDown,
      parentMeals,
      kidsMeals: { breakfast: false, lunch: false, dinner: false },
    });
    const allMeals = plan.days.flatMap((d) => d.meals);
    expect(allMeals.some((m) => m.track === "kids")).toBe(false);
  });

  it("adds an adult breakfast when parentMeals.breakfast is on", () => {
    const plan = buildMockWeekPlan({
      weekStartDate: "2026-08-03",
      numDays: 7,
      familyMeals: allSitDown,
      parentMeals: { breakfast: true, lunch: true, dinner: true },
      kidsMeals,
    });
    const allMeals = plan.days.flatMap((d) => d.meals);
    expect(allMeals.some((m) => m.track === "adult" && m.slot === "breakfast")).toBe(true);
  });
});
